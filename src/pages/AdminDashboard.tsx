import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { getClaimProgress, CLAIM_STATES, STATE_LABELS, getStateIndex, buildInitialSteps, type ClaimState, type ClaimStep } from "@/lib/claimStateMachine";
import { AdminAnalyticsCharts } from "@/components/AdminAnalyticsCharts";
import { AdminAuditLog } from "@/components/AdminAuditLog";
import { AdminClaimDetail } from "@/components/AdminClaimDetail";
import { AdminUserManagement } from "@/components/AdminUserManagement";
import { AdminDisputesTab } from "@/components/AdminDisputesTab";
import { AdminAgentLogs } from "@/components/AdminAgentLogs";
import {
  FileText, Search, BarChart3, Clock, CheckCircle2, Users,
  HandMetal, IndianRupee, Pause, Play, SlidersHorizontal,
  XCircle, CheckCheck, AlertTriangle, ShieldAlert, TrendingUp, Activity, Terminal,
} from "lucide-react";
import { type FraudAnalysis } from "@/components/FraudAnalysisPanel";

interface AdminClaimRow {
  id: string;
  claim_number: string;
  policy_id: string;
  vehicle_number: string;
  description: string;
  location: string;
  status: string;
  garage: string | null;
  created_at: string;
  user_id: string;
  damage_image_url: string | null;
  steps: ClaimStep[];
  billing: Record<string, number | string> | null;
  spare_parts: string[];
  awaiting_confirmation: boolean;
  pending_step: number;
  paused?: boolean;
  fraud_analysis?: FraudAnalysis | null;
  incident_datetime?: string | null;
  vehicle_type?: string | null;
  damage_severity?: string | null;
}

type BulkAction = "pause" | "resume" | "reject";

export default function AdminDashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [claims, setClaims] = useState<AdminClaimRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [pausedOnly, setPausedOnly] = useState(false);
  const [fraudFilter, setFraudFilter] = useState<string>("all");
  const [selectedClaim, setSelectedClaim] = useState<AdminClaimRow | null>(null);
  const [interveneOpen, setInterveneOpen] = useState(false);
  const [interveneNote, setInterveneNote] = useState("");
  const [interveneAction, setInterveneAction] = useState<"approve" | "reject" | "override" | "confirm_payment" | "pause" | "resume">("approve");
  const [interveneTargetState, setInterveneTargetState] = useState<string>("");
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [showAnalytics, setShowAnalytics] = useState(true);
  const [auditRefreshKey, setAuditRefreshKey] = useState(0);
  const [detailClaim, setDetailClaim] = useState<AdminClaimRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"claims" | "users" | "disputes" | "logs">("claims");
  const [disputeBadge, setDisputeBadge] = useState(0);
  const kpiRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<BulkAction>("pause");
  const [bulkNote, setBulkNote] = useState("");
  const [bulkDialogOpen, setBulkDialogOpen] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const sendStatusEmail = async (claim: AdminClaimRow, newStatus: string, adminNote?: string) => {
    try {
      await supabase.functions.invoke("notify-claim-status", {
        body: {
          claim_id: claim.id,
          new_status: newStatus,
          claim_number: claim.claim_number,
          vehicle_number: claim.vehicle_number,
          garage: claim.garage,
          admin_note: adminNote || "",
        },
      });
    } catch (e) {
      console.error("Email notification failed:", e);
    }
  };

  const logAudit = async (claimId: string, action: string, details: string, prevStatus: string, newStatus: string) => {
    if (!user) return;
    await supabase.from("admin_audit_log" as any).insert({
      admin_user_id: user.id,
      claim_id: claimId,
      action,
      details,
      previous_status: prevStatus,
      new_status: newStatus,
    } as any);
    setAuditRefreshKey(k => k + 1);
  };

  /**
   * Force-advance a claim to the next state, bypassing the AI agent.
   * Marks the current step completed with an admin-override note, advances status,
   * and writes a permanent entry to the audit log.
   */
  const handleForceAdvance = async (claimId: string, stepIndex: number, reason: string) => {
    const claim = claims.find(c => c.id === claimId);
    if (!claim) return;

    const currentState = CLAIM_STATES[stepIndex] as ClaimState;
    const nextState = CLAIM_STATES[stepIndex + 1] as ClaimState | undefined;
    if (!nextState) return;

    const now = new Date().toISOString();
    const nowDisplay = new Date().toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });

    const updatedSteps = (claim.steps || []).map((s: ClaimStep, i: number) => {
      if (i === stepIndex) {
        return {
          ...s,
          status: "completed",
          timestamp: nowDisplay,
          details: `[Admin Override] ${reason}`,
          ai_processed: false,
          completed_at: now,
        };
      }
      if (i === stepIndex + 1) {
        return { ...s, status: "in-progress", started_at: now };
      }
      return s;
    });

    const { error } = await supabase
      .from("claims" as any)
      .update({
        status: nextState,
        steps: updatedSteps,
        pending_step: stepIndex + 1,
        awaiting_confirmation: false,
        updated_at: now,
      })
      .eq("id", claimId);

    if (error) {
      toast({ title: "Error", description: "Failed to force advance claim.", variant: "destructive" });
      return;
    }

    await logAudit(claimId, "force_advance", `Admin override — reason: ${reason}`, currentState, nextState);

    // Send email notification with the force-advance reason
    await sendStatusEmail(
      { ...claim, status: nextState, steps: updatedSteps as ClaimStep[], pending_step: stepIndex + 1, awaiting_confirmation: false },
      nextState,
      `Your claim was manually advanced by an admin. Reason: ${reason}`
    );

    toast({
      title: "Claim Advanced",
      description: `${claim.claim_number} advanced to ${STATE_LABELS[nextState]}.`,
    });

    // Reflect changes locally so the sheet updates immediately
    const updated: AdminClaimRow = {
      ...claim,
      status: nextState,
      steps: updatedSteps as ClaimStep[],
      pending_step: stepIndex + 1,
      awaiting_confirmation: false,
    };
    setClaims(prev => prev.map(c => c.id === claimId ? updated : c));
    setDetailClaim(updated);
  };

  const fetchClaims = async () => {
    const { data, error } = await supabase
      .from("claims" as any)
      .select("*")
      .order("created_at", { ascending: false });
    if (error) {
      toast({ title: "Error", description: "Failed to load claims", variant: "destructive" });
    }
    setClaims((data as any as AdminClaimRow[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchClaims();
    // Fetch dispute badge count
    supabase.from("claim_disputes" as any).select("id").eq("status", "pending").then(({ data }) => {
      setDisputeBadge((data as any[] || []).length);
    });

    const channel = supabase
      .channel("admin-claims")
      .on("postgres_changes", { event: "*", schema: "public", table: "claims" }, () => {
        fetchClaims();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "claim_disputes" }, () => {
        supabase.from("claim_disputes" as any).select("id").eq("status", "pending").then(({ data }) => {
          setDisputeBadge((data as any[] || []).length);
        });
      })
      .subscribe();

    // KPI auto-refresh every 30s
    kpiRefreshRef.current = setInterval(fetchClaims, 30_000);
    return () => {
      supabase.removeChannel(channel);
      if (kpiRefreshRef.current) clearInterval(kpiRefreshRef.current);
    };
  }, []);

  const handlePauseResume = async (claim: AdminClaimRow, action: "pause" | "resume") => {
    const isPause = action === "pause";
    await supabase.from("claims" as any).update({
      paused: isPause,
      awaiting_confirmation: isPause ? false : claim.awaiting_confirmation,
    } as any).eq("id", claim.id);

    await logAudit(claim.id, action, `Claim ${isPause ? "paused" : "resumed"} by admin.`, claim.status, claim.status);
    await sendStatusEmail(claim, isPause ? "paused" : claim.status);

    toast({
      title: isPause ? "Claim Paused" : "Claim Resumed",
      description: `${claim.claim_number} has been ${isPause ? "paused" : "resumed"}.`,
    });
    setInterveneOpen(false);
    setInterveneNote("");
    setSelectedClaim(null);
  };

  const handleConfirmPayment = async (claim: AdminClaimRow) => {
    setPaymentProcessing(true);
    try {
      await new Promise(r => setTimeout(r, 2000));
      const currentSteps = claim.steps || [];

      const paymentIdx = getStateIndex("PAYMENT_CONFIRMED");
      const updatedSteps1 = currentSteps.map((s, i) => ({
        ...s,
        status: i <= paymentIdx ? "completed" : i === paymentIdx + 1 ? "in-progress" : s.status,
        details: i === paymentIdx ? `Payment verified by admin. Transaction ID: TXN-${Date.now().toString(36).toUpperCase()}` : s.details,
        timestamp: i === paymentIdx ? new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : s.timestamp,
      }));

      await supabase.from("claims" as any).update({
        status: "PAYMENT_CONFIRMED",
        steps: updatedSteps1,
        awaiting_confirmation: false,
      } as any).eq("id", claim.id);

      await new Promise(r => setTimeout(r, 1500));

      const gatePassIdx = getStateIndex("GATE_PASS_ISSUED");
      const gatePassNumber = `GP-2026-${Math.floor(Math.random() * 99999).toString().padStart(5, "0")}`;
      const updatedSteps2 = updatedSteps1.map((s, i) => ({
        ...s,
        status: i <= gatePassIdx ? "completed" : i === gatePassIdx + 1 ? "in-progress" : s.status,
        details: i === gatePassIdx ? `Gate Pass ${gatePassNumber} issued. Vehicle ${claim.vehicle_number} authorized for release.` : s.details,
        timestamp: i === gatePassIdx ? new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : s.timestamp,
      }));

      await supabase.from("claims" as any).update({
        status: "GATE_PASS_ISSUED",
        steps: updatedSteps2,
      } as any).eq("id", claim.id);

      await new Promise(r => setTimeout(r, 1000));

      const closedIdx = getStateIndex("CLAIM_CLOSED");
      const updatedSteps3 = updatedSteps2.map((s, i) => ({
        ...s,
        status: i <= closedIdx ? "completed" : s.status,
        details: i === closedIdx ? "Claim processing complete. All stages verified." : s.details,
        timestamp: i === closedIdx ? new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : s.timestamp,
      }));

      await supabase.from("claims" as any).update({
        status: "CLAIM_CLOSED",
        steps: updatedSteps3,
      } as any).eq("id", claim.id);

      await logAudit(claim.id, "confirm_payment", `Payment confirmed. Gate Pass ${gatePassNumber} issued. Claim closed.`, "BILL_GENERATED", "CLAIM_CLOSED");
      await sendStatusEmail(claim, "GATE_PASS_ISSUED");

      toast({ title: "Payment Confirmed", description: `Gate Pass ${gatePassNumber} issued. Claim closed.` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Payment confirmation failed", variant: "destructive" });
    }
    setPaymentProcessing(false);
    setInterveneOpen(false);
    setSelectedClaim(null);
  };

  const handleIntervene = async () => {
    if (!selectedClaim) return;

    if (interveneAction === "confirm_payment") {
      await handleConfirmPayment(selectedClaim);
      return;
    }

    if (interveneAction === "pause" || interveneAction === "resume") {
      await handlePauseResume(selectedClaim, interveneAction);
      return;
    }

    try {
      if (interveneAction === "reject") {
        const steps = (selectedClaim.steps || []).map((s: any) => ({
          ...s,
          status: s.status === "in-progress" ? "failed" : s.status,
          details: s.status === "in-progress" ? `ADMIN REJECTED: ${interveneNote}` : s.details,
        }));
        await supabase.from("claims" as any).update({
          status: "rejected",
          steps,
          awaiting_confirmation: false,
        } as any).eq("id", selectedClaim.id);
        await logAudit(selectedClaim.id, "reject", interveneNote, selectedClaim.status, "rejected");
        await sendStatusEmail(selectedClaim, "rejected", interveneNote);
        toast({ title: "Claim Rejected", description: `Claim ${selectedClaim.claim_number} has been rejected.` });

      } else if (interveneAction === "approve") {
        const currentIdx = getStateIndex(selectedClaim.status as ClaimState);
        const nextIdx = currentIdx + 1;
        if (nextIdx < CLAIM_STATES.length) {
          const nextState = CLAIM_STATES[nextIdx];
          const steps = (selectedClaim.steps || []).map((s: any, i: number) => ({
            ...s,
            status: i <= nextIdx ? (i < nextIdx ? "completed" : "in-progress") : "pending",
            details: i === currentIdx ? `${s.details || ""} [Admin approved: ${interveneNote}]` : s.details,
            timestamp: i === currentIdx ? new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : s.timestamp,
          }));
          await supabase.from("claims" as any).update({
            status: nextState,
            steps,
            awaiting_confirmation: false,
            pending_step: nextIdx,
          } as any).eq("id", selectedClaim.id);

          await logAudit(selectedClaim.id, "approve", interveneNote, selectedClaim.status, nextState);
          await sendStatusEmail(selectedClaim, nextState, interveneNote);

          supabase.functions.invoke("process-claim", {
            body: { claim_id: selectedClaim.id, start_step: nextIdx },
          }).catch(console.error);

          toast({ title: "Admin Override", description: `Moved to ${STATE_LABELS[nextState]}. Agent processing triggered.` });
        }
      } else if (interveneAction === "override" && interveneTargetState) {
        const targetIdx = getStateIndex(interveneTargetState as ClaimState);
        const steps = (selectedClaim.steps || buildInitialSteps()).map((s: any, i: number) => ({
          ...s,
          status: i < targetIdx ? "completed" : i === targetIdx ? "in-progress" : "pending",
          details: i === targetIdx ? `ADMIN OVERRIDE: ${interveneNote}` : s.details,
          timestamp: i <= targetIdx ? new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : s.timestamp,
        }));
        await supabase.from("claims" as any).update({
          status: interveneTargetState,
          steps,
          awaiting_confirmation: false,
          pending_step: targetIdx,
        } as any).eq("id", selectedClaim.id);
        await logAudit(selectedClaim.id, "override", interveneNote, selectedClaim.status, interveneTargetState);
        await sendStatusEmail(selectedClaim, interveneTargetState, interveneNote);
        toast({ title: "State Override", description: `Claim moved to ${STATE_LABELS[interveneTargetState as ClaimState]}.` });
      }
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }

    setInterveneOpen(false);
    setInterveneNote("");
    setSelectedClaim(null);
  };

  // ─── Bulk actions ────────────────────────────────────────────────────────────
  const bulkEligibleClaims = claims.filter(
    c => c.status !== "CLAIM_CLOSED" && c.status !== "rejected"
  );

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    const visibleIds = filteredClaims
      .filter(c => c.status !== "CLAIM_CLOSED" && c.status !== "rejected")
      .map(c => c.id);
    const allSelected = visibleIds.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        visibleIds.forEach(id => next.delete(id));
        return next;
      });
    } else {
      setSelectedIds(prev => new Set([...prev, ...visibleIds]));
    }
  };

  const handleBulkExecute = async () => {
    setBulkProcessing(true);
    const targets = claims.filter(c => selectedIds.has(c.id));
    let processed = 0;

    for (const claim of targets) {
      try {
        if (bulkAction === "pause") {
          await supabase.from("claims" as any).update({ paused: true, awaiting_confirmation: false } as any).eq("id", claim.id);
          await logAudit(claim.id, "pause", `Bulk pause. ${bulkNote}`, claim.status, claim.status);
          await sendStatusEmail(claim, "paused", bulkNote || undefined);
        } else if (bulkAction === "resume") {
          await supabase.from("claims" as any).update({ paused: false } as any).eq("id", claim.id);
          await logAudit(claim.id, "resume", `Bulk resume. ${bulkNote}`, claim.status, claim.status);
          await sendStatusEmail(claim, claim.status, bulkNote || undefined);
        } else if (bulkAction === "reject") {
          const steps = (claim.steps || []).map((s: any) => ({
            ...s,
            status: s.status === "in-progress" ? "failed" : s.status,
            details: s.status === "in-progress" ? `BULK REJECT: ${bulkNote}` : s.details,
          }));
          await supabase.from("claims" as any).update({ status: "rejected", steps, awaiting_confirmation: false } as any).eq("id", claim.id);
          await logAudit(claim.id, "reject", `Bulk reject. ${bulkNote}`, claim.status, "rejected");
          await sendStatusEmail(claim, "rejected", bulkNote || undefined);
        }
        processed++;
      } catch (err) {
        console.error(`Bulk action failed for ${claim.claim_number}`, err);
      }
    }

    toast({
      title: "Bulk Action Complete",
      description: `${processed} claim${processed !== 1 ? "s" : ""} ${bulkAction === "pause" ? "paused" : bulkAction === "resume" ? "resumed" : "rejected"}.`,
    });

    setSelectedIds(new Set());
    setBulkNote("");
    setBulkDialogOpen(false);
    setBulkProcessing(false);
  };

  // ─── Filtering ───────────────────────────────────────────────────────────────
  const filteredClaims = claims.filter(c => {
    const matchesSearch = !search ||
      c.claim_number.toLowerCase().includes(search.toLowerCase()) ||
      c.vehicle_number.toLowerCase().includes(search.toLowerCase()) ||
      c.policy_id.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || c.status === statusFilter;
    const matchesPaused = !pausedOnly || c.paused;
    const fraud = (c as any).fraud_analysis;
    const matchesFraud = fraudFilter === "all" || (fraud && fraud.risk_level === fraudFilter);
    return matchesSearch && matchesStatus && matchesPaused && matchesFraud;
  });

  // Fraud risk counts for badge
  const fraudCounts: Record<string, number> = { LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 };
  claims.forEach(c => {
    const lvl = (c as any).fraud_analysis?.risk_level;
    if (lvl && fraudCounts[lvl] !== undefined) fraudCounts[lvl]++;
  });
  const highRiskCount = (fraudCounts.HIGH || 0) + (fraudCounts.CRITICAL || 0);

  const totalClaims = claims.length;
  const activeClaims = claims.filter(c => c.status !== "CLAIM_CLOSED" && c.status !== "rejected").length;
  const completedClaims = claims.filter(c => c.status === "CLAIM_CLOSED").length;
  const pausedClaims = claims.filter(c => c.paused).length;

  // KPI banner computations
  const todayStr = new Date().toISOString().split("T")[0];
  const claimsToday = claims.filter(c => c.created_at.startsWith(todayStr)).length;
  const inProgressCount = claims.filter(c =>
    c.status !== "CLAIM_CLOSED" && c.status !== "rejected" && !c.paused
  ).length;
  const highFraudCount = claims.filter(c => {
    const lvl = (c as any).fraud_analysis?.risk_level;
    return lvl === "HIGH" || lvl === "CRITICAL";
  }).length;

  const kpiCards = [
    { label: "New Today", value: claimsToday, icon: TrendingUp, color: "text-primary", bg: "bg-primary/10" },
    { label: "In Progress", value: inProgressCount, icon: Activity, color: "text-status-info", bg: "bg-status-info/10" },
    { label: "High Fraud Risk", value: highFraudCount, icon: ShieldAlert, color: "text-destructive", bg: "bg-destructive/10" },
    { label: "Open Disputes", value: disputeBadge, icon: AlertTriangle, color: "text-status-warning", bg: "bg-status-warning/10" },
  ];


  const stats = [
    { icon: FileText, label: "Total Claims", value: totalClaims, color: "text-primary" },
    { icon: Clock, label: "Active", value: activeClaims, color: "text-status-info" },
    { icon: CheckCircle2, label: "Completed", value: completedClaims, color: "text-status-success" },
    {
      icon: Pause, label: "Paused", value: pausedClaims, color: "text-status-warning",
      onClick: () => setPausedOnly(p => !p),
      active: pausedOnly,
    },
  ];

  // Visible eligible-for-selection ids in current view
  const visibleEligibleIds = filteredClaims
    .filter(c => c.status !== "CLAIM_CLOSED" && c.status !== "rejected")
    .map(c => c.id);
  const allVisibleSelected = visibleEligibleIds.length > 0 && visibleEligibleIds.every(id => selectedIds.has(id));
  const someVisibleSelected = visibleEligibleIds.some(id => selectedIds.has(id));

  return (
    <div className="container py-12">
      <div className="mb-6 animate-slide-up flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Admin Dashboard</h1>
          <p className="mt-2 text-muted-foreground">Monitor and intervene on all claims across the system</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Tab switcher */}
          <div className="flex rounded-lg border border-border bg-muted p-1 gap-1">
            <button
              onClick={() => setActiveTab("claims")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "claims"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <FileText className="h-4 w-4" /> Claims
            </button>
            <button
              onClick={() => setActiveTab("disputes")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all relative ${
                activeTab === "disputes"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <AlertTriangle className="h-4 w-4" /> Disputes
              {disputeBadge > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-destructive text-[9px] font-bold text-destructive-foreground">
                  {disputeBadge > 9 ? "9+" : disputeBadge}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("users")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "users"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Users className="h-4 w-4" /> Users
            </button>
            <button
              onClick={() => setActiveTab("logs")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                activeTab === "logs"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Terminal className="h-4 w-4" /> Agent Logs
            </button>
          </div>
          {activeTab === "claims" && (
            <Button variant="outline" size="sm" onClick={() => setShowAnalytics(!showAnalytics)}>
              <BarChart3 className="h-4 w-4 mr-1" /> {showAnalytics ? "Hide" : "Show"} Analytics
            </Button>
          )}
        </div>
      </div>

      {/* KPI Live Banner */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6 animate-slide-up" style={{ animationDelay: "60ms" }}>
        {kpiCards.map((kpi) => (
          <Card key={kpi.label} className="shadow-card">
            <CardContent className="py-4 flex items-center gap-3">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${kpi.bg} ${kpi.color}`}>
                <kpi.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-2xl font-bold text-foreground">{kpi.value}</p>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Users tab */}
      {activeTab === "users" && <AdminUserManagement />}

      {/* Disputes tab */}
      {activeTab === "disputes" && <AdminDisputesTab />}

      {/* Agent Logs tab */}
      {activeTab === "logs" && <AdminAgentLogs />}


      {/* Claims tab — everything below only shown when claims tab is active */}
      {activeTab === "claims" && <>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat, i) => (
          <Card
            key={stat.label}
            className={`shadow-card animate-slide-up transition-all ${
              (stat as any).onClick ? "cursor-pointer hover:shadow-elevated" : ""
            } ${(stat as any).active ? "ring-2 ring-status-warning/50 bg-status-warning/5" : ""}`}
            style={{ animationDelay: `${i * 60}ms` }}
            onClick={(stat as any).onClick}
          >
            <CardContent className="py-5">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg bg-muted ${stat.color}`}>
                  <stat.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">
                    {stat.label}
                    {(stat as any).onClick && (
                      <span className="ml-1 text-status-warning">{(stat as any).active ? "— click to clear" : "— click to filter"}</span>
                    )}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Analytics Charts */}
      {showAnalytics && <AdminAnalyticsCharts claims={claims} />}

      {/* Audit Log */}
      <AdminAuditLog key={auditRefreshKey} />

      {/* Filters */}
      <Card className="shadow-card mb-4 animate-slide-up" style={{ animationDelay: "240ms" }}>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by claim #, vehicle, or policy..."
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {CLAIM_STATES.map(state => (
                  <SelectItem key={state} value={state}>{STATE_LABELS[state]}</SelectItem>
                ))}
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
            {/* Fraud risk filter */}
            <Select value={fraudFilter} onValueChange={setFraudFilter}>
              <SelectTrigger className={`w-full sm:w-[190px] ${fraudFilter !== "all" ? "border-destructive/60 bg-destructive/5 text-destructive" : ""}`}>
                <ShieldAlert className="h-4 w-4 mr-1.5 shrink-0" />
                <SelectValue placeholder="Fraud Risk" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">
                  <span className="flex items-center gap-2">All Fraud Levels</span>
                </SelectItem>
                <SelectItem value="LOW">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-status-success inline-block" />
                    LOW Risk
                    {fraudCounts.LOW > 0 && <span className="ml-auto text-xs text-muted-foreground">({fraudCounts.LOW})</span>}
                  </span>
                </SelectItem>
                <SelectItem value="MEDIUM">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-status-warning inline-block" />
                    MEDIUM Risk
                    {fraudCounts.MEDIUM > 0 && <span className="ml-auto text-xs text-muted-foreground">({fraudCounts.MEDIUM})</span>}
                  </span>
                </SelectItem>
                <SelectItem value="HIGH">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-destructive inline-block" />
                    HIGH Risk
                    {fraudCounts.HIGH > 0 && <span className="ml-auto text-xs text-muted-foreground">({fraudCounts.HIGH})</span>}
                  </span>
                </SelectItem>
                <SelectItem value="CRITICAL">
                  <span className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-destructive inline-block animate-pulse" />
                    CRITICAL Risk
                    {fraudCounts.CRITICAL > 0 && <span className="ml-auto text-xs text-muted-foreground">({fraudCounts.CRITICAL})</span>}
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
            {/* Paused filter chip */}
            <button
              onClick={() => setPausedOnly(p => !p)}
              className={`flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-all ${
                pausedOnly
                  ? "bg-status-warning/10 border-status-warning/50 text-status-warning"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              }`}
            >
              <Pause className="h-4 w-4" />
              Paused Only
              {pausedClaims > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-bold ${pausedOnly ? "bg-status-warning/20 text-status-warning" : "bg-muted text-muted-foreground"}`}>
                  {pausedClaims}
                </span>
              )}
            </button>
            {/* Active filter indicators */}
            {(fraudFilter !== "all" || pausedOnly || statusFilter !== "all" || search) && (
              <button
                onClick={() => { setFraudFilter("all"); setPausedOnly(false); setStatusFilter("all"); setSearch(""); }}
                className="flex items-center gap-1.5 px-3 py-2 rounded-md border border-border text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-all"
              >
                <XCircle className="h-3.5 w-3.5" /> Clear Filters
              </button>
            )}
          </div>
          {/* High risk alert banner */}
          {highRiskCount > 0 && fraudFilter === "all" && (
            <div
              className="mt-3 flex items-center gap-2 rounded-md bg-destructive/8 border border-destructive/20 px-3 py-2 text-sm cursor-pointer hover:bg-destructive/12 transition-colors"
              onClick={() => setFraudFilter("HIGH")}
            >
              <ShieldAlert className="h-4 w-4 text-destructive shrink-0" />
              <span className="text-destructive font-medium">{highRiskCount} high-risk claim{highRiskCount !== 1 ? "s" : ""} detected</span>
              <span className="text-muted-foreground">— click to filter HIGH &amp; CRITICAL risk claims</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Bulk action toolbar */}
      {selectedIds.size > 0 && (
        <div className="mb-4 flex items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 animate-slide-up">
          <CheckCheck className="h-4 w-4 text-primary shrink-0" />
          <span className="text-sm font-medium text-foreground">
            {selectedIds.size} claim{selectedIds.size !== 1 ? "s" : ""} selected
          </span>
          <div className="flex gap-2 ml-auto flex-wrap">
            <Button
              size="sm"
              variant="outline"
              className="text-status-warning border-status-warning/30 hover:bg-status-warning/10"
              onClick={() => { setBulkAction("pause"); setBulkDialogOpen(true); }}
            >
              <Pause className="h-3.5 w-3.5 mr-1" /> Bulk Pause
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-status-success border-status-success/30 hover:bg-status-success/10"
              onClick={() => { setBulkAction("resume"); setBulkDialogOpen(true); }}
            >
              <Play className="h-3.5 w-3.5 mr-1" /> Bulk Resume
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive/30 hover:bg-destructive/10"
              onClick={() => { setBulkAction("reject"); setBulkDialogOpen(true); }}
            >
              <XCircle className="h-3.5 w-3.5 mr-1" /> Bulk Reject
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-muted-foreground"
              onClick={() => setSelectedIds(new Set())}
            >
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Claims List */}
      {loading ? (
        <div className="text-center py-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        </div>
      ) : filteredClaims.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="py-12 text-center">
            <Users className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">
              {pausedOnly ? "No paused claims found." : "No claims found."}
            </p>
            {pausedOnly && (
              <Button variant="link" size="sm" onClick={() => setPausedOnly(false)} className="mt-2">
                Clear filter
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {/* Select-all row */}
          {visibleEligibleIds.length > 0 && (
            <div className="flex items-center gap-2 px-1 pb-1">
              <Checkbox
                id="select-all"
                checked={allVisibleSelected}
                onCheckedChange={toggleSelectAll}
                className="data-[state=indeterminate]:bg-primary/50"
                data-state={!allVisibleSelected && someVisibleSelected ? "indeterminate" : allVisibleSelected ? "checked" : "unchecked"}
              />
              <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer select-none">
                Select all eligible ({visibleEligibleIds.length})
              </label>
            </div>
          )}

          {filteredClaims.map((claim, i) => {
            const progress = getClaimProgress(claim.status);
            const isEligible = claim.status !== "CLAIM_CLOSED" && claim.status !== "rejected";
            const isSelected = selectedIds.has(claim.id);

            return (
              <Card
                key={claim.id}
                className={`shadow-card hover:shadow-elevated transition-all animate-slide-up ${
                  claim.paused ? "border-status-warning/40 bg-status-warning/5" : ""
                } ${isSelected ? "ring-2 ring-primary/40 bg-primary/3" : ""}`}
                style={{ animationDelay: `${300 + i * 40}ms` }}
              >
                <CardContent className="py-4">
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
                    {/* Checkbox */}
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      {isEligible && (
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleSelect(claim.id)}
                          className="mt-0.5 shrink-0"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <h3 className="text-sm font-semibold text-foreground">{claim.claim_number}</h3>
                          <StatusBadge status={claim.status} />
                          {claim.paused && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-status-warning/10 px-2.5 py-0.5 text-xs font-semibold text-status-warning">
                              <Pause className="h-3 w-3" /> Paused
                            </span>
                          )}
                          {claim.status === "BILL_GENERATED" && !claim.paused && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-status-warning/10 px-2.5 py-0.5 text-xs font-semibold text-status-warning animate-pulse-soft">
                              <IndianRupee className="h-3 w-3" /> Payment Pending
                            </span>
                          )}
                          {claim.awaiting_confirmation && !claim.paused && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-status-warning/10 px-2 py-0.5 text-xs font-medium text-status-warning">
                              <Clock className="h-3 w-3" /> Awaiting Confirmation
                            </span>
                          )}
                          {/* Fraud risk inline badge */}
                          {(claim as any).fraud_analysis?.risk_level && (() => {
                            const lvl = (claim as any).fraud_analysis.risk_level as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
                            const cfg = {
                              LOW:      { cls: "bg-status-success/10 text-status-success border-status-success/20", icon: "🟢" },
                              MEDIUM:   { cls: "bg-status-warning/10 text-status-warning border-status-warning/20", icon: "🟡" },
                              HIGH:     { cls: "bg-destructive/10 text-destructive border-destructive/20", icon: "🔴" },
                              CRITICAL: { cls: "bg-destructive/15 text-destructive border-destructive/30", icon: "🚨" },
                            }[lvl];
                            return (
                              <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${cfg.cls}`}>
                                <ShieldAlert className="h-2.5 w-2.5" /> {lvl}
                              </span>
                            );
                          })()}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-1">{claim.description}</p>
                        <div className="flex flex-wrap gap-3 mt-1.5 text-xs text-muted-foreground">
                          <span>Policy: {claim.policy_id}</span>
                          <span>Vehicle: {claim.vehicle_number}</span>
                          <span>Location: {claim.location}</span>
                          {claim.garage && <span>Garage: {claim.garage}</span>}
                          <span>{new Date(claim.created_at).toLocaleDateString()}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0 flex-wrap pl-7 lg:pl-0">
                      <div className="flex items-center gap-2 w-28">
                        <Progress value={progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground font-medium w-8 text-right">{progress}%</span>
                      </div>
                      {/* Pause / Resume quick button */}
                      {claim.status !== "CLAIM_CLOSED" && claim.status !== "rejected" && (
                        <Button
                          variant="outline"
                          size="sm"
                          className={claim.paused ? "text-status-success border-status-success/30" : "text-status-warning border-status-warning/30"}
                          onClick={async () => {
                            await handlePauseResume(claim, claim.paused ? "resume" : "pause");
                          }}
                        >
                          {claim.paused ? <><Play className="h-3 w-3 mr-1" /> Resume</> : <><Pause className="h-3 w-3 mr-1" /> Pause</>}
                        </Button>
                      )}
                      {/* Detail Panel */}
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setDetailClaim(claim);
                          setDetailOpen(true);
                        }}
                      >
                        <SlidersHorizontal className="h-3 w-3 mr-1" /> Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-status-warning border-status-warning/30"
                        onClick={() => {
                          setSelectedClaim(claim);
                          setInterveneAction("approve");
                          setInterveneTargetState("");
                          setInterveneOpen(true);
                        }}
                      >
                        <HandMetal className="h-3 w-3 mr-1" /> Intervene
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Admin Claim Detail Slide-over */}
      <AdminClaimDetail
        claim={detailClaim}
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        onIntervene={() => {
          setDetailOpen(false);
          if (detailClaim) {
            setSelectedClaim(detailClaim);
            setInterveneAction("approve");
            setInterveneTargetState("");
            setInterveneOpen(true);
          }
        }}
        onForceAdvance={detailClaim
          ? (stepIndex, reason) => handleForceAdvance(detailClaim.id, stepIndex, reason)
          : undefined
        }
      />

      {/* Single Intervene Dialog */}
      <Dialog open={interveneOpen} onOpenChange={setInterveneOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Admin Intervention — {selectedClaim?.claim_number}</DialogTitle>
            <DialogDescription>
              Current status: <strong>{selectedClaim?.status ? STATE_LABELS[selectedClaim.status as ClaimState] || selectedClaim.status : "Unknown"}</strong>
              {selectedClaim?.paused && <span className="ml-2 text-status-warning font-medium">(Paused)</span>}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Action</label>
              <Select value={interveneAction} onValueChange={(v: any) => setInterveneAction(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="approve">Approve & Advance</SelectItem>
                  <SelectItem value="reject">Reject Claim</SelectItem>
                  <SelectItem value="override">Override to Specific State</SelectItem>
                  {selectedClaim?.status === "BILL_GENERATED" && (
                    <SelectItem value="confirm_payment">Confirm Payment</SelectItem>
                  )}
                  {selectedClaim && selectedClaim.status !== "CLAIM_CLOSED" && selectedClaim.status !== "rejected" && (
                    selectedClaim.paused
                      ? <SelectItem value="resume">Resume Claim</SelectItem>
                      : <SelectItem value="pause">Pause Claim</SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {interveneAction === "override" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Target State</label>
                <Select value={interveneTargetState} onValueChange={setInterveneTargetState}>
                  <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                  <SelectContent>
                    {CLAIM_STATES.map(state => (
                      <SelectItem key={state} value={state}>{STATE_LABELS[state]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {interveneAction !== "confirm_payment" && (
              <div className="space-y-2">
                <label className="text-sm font-medium">Admin Note <span className="text-muted-foreground font-normal">(sent to user via email)</span></label>
                <Textarea
                  placeholder="Provide reason for intervention..."
                  value={interveneNote}
                  onChange={(e) => setInterveneNote(e.target.value)}
                  rows={3}
                />
              </div>
            )}

            {interveneAction === "confirm_payment" && selectedClaim?.billing && (
              <div className="rounded-lg bg-muted p-4 space-y-2">
                <p className="text-sm font-medium">Billing Summary</p>
                {Object.entries(selectedClaim.billing)
                  .filter(([_, val]) => typeof val === "number")
                  .map(([key, val]) => (
                    <div key={key} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase())}</span>
                      <span className="font-medium">₹{(val as number).toLocaleString()}</span>
                    </div>
                  ))}
              </div>
            )}

            <p className="text-xs text-muted-foreground">📧 An email notification will be sent to the user after this action.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInterveneOpen(false)}>Cancel</Button>
            <Button
              variant={interveneAction === "reject" ? "destructive" : interveneAction === "pause" ? "secondary" : "default"}
              onClick={handleIntervene}
              disabled={
                paymentProcessing ||
                (interveneAction !== "confirm_payment" && interveneAction !== "pause" && interveneAction !== "resume" && !interveneNote.trim()) ||
                (interveneAction === "override" && !interveneTargetState)
              }
            >
              {paymentProcessing ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Processing...
                </span>
              ) : interveneAction === "confirm_payment" ? "Confirm Payment"
                : interveneAction === "reject" ? "Reject Claim"
                : interveneAction === "override" ? "Override State"
                : interveneAction === "pause" ? "Pause Claim"
                : interveneAction === "resume" ? "Resume Claim"
                : "Approve & Advance"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Action Dialog */}
      <Dialog open={bulkDialogOpen} onOpenChange={setBulkDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {bulkAction === "reject" ? <AlertTriangle className="h-5 w-5 text-destructive" /> : bulkAction === "pause" ? <Pause className="h-5 w-5 text-status-warning" /> : <Play className="h-5 w-5 text-status-success" />}
              Bulk {bulkAction === "pause" ? "Pause" : bulkAction === "resume" ? "Resume" : "Reject"} — {selectedIds.size} Claims
            </DialogTitle>
            <DialogDescription>
              This will {bulkAction} all {selectedIds.size} selected claim{selectedIds.size !== 1 ? "s" : ""} and send email notifications.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <label className="text-sm font-medium">Note <span className="text-muted-foreground font-normal">(optional — sent to users)</span></label>
              <Textarea
                placeholder={`Reason for bulk ${bulkAction}...`}
                value={bulkNote}
                onChange={e => setBulkNote(e.target.value)}
                rows={3}
              />
            </div>
            {/* Preview list */}
            <div className="rounded-lg border border-border bg-muted/30 p-3 max-h-36 overflow-y-auto">
              {claims.filter(c => selectedIds.has(c.id)).map(c => (
                <div key={c.id} className="flex items-center justify-between py-0.5 text-xs">
                  <span className="font-medium text-foreground">{c.claim_number}</span>
                  <StatusBadge status={c.status} />
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkDialogOpen(false)}>Cancel</Button>
            <Button
              variant={bulkAction === "reject" ? "destructive" : "default"}
              onClick={handleBulkExecute}
              disabled={bulkProcessing}
            >
              {bulkProcessing ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Processing...
                </span>
              ) : `Confirm Bulk ${bulkAction === "pause" ? "Pause" : bulkAction === "resume" ? "Resume" : "Reject"}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      </> /* end claims tab */}
    </div>
  );
}
