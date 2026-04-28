import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { StatusBadge } from "@/components/StatusBadge";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  FileText, Car, MapPin, Building2, Package, IndianRupee,
  Clock, CheckCircle2, XCircle, Loader2, Image as ImageIcon,
  ExternalLink, Pause, CalendarDays, User, FastForward, RefreshCw, AlertTriangle, ShieldAlert,
} from "lucide-react";
import {
  getClaimProgress, getStateIndex, STATE_LABELS,
  CLAIM_STATES, type ClaimState, type ClaimStep,
} from "@/lib/claimStateMachine";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { FraudAnalysisPanel, type FraudAnalysis } from "@/components/FraudAnalysisPanel";
import { useToast } from "@/hooks/use-toast";

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
}

interface AdminClaimDetailProps {
  claim: AdminClaimRow | null;
  open: boolean;
  onClose: () => void;
  onIntervene: () => void;
  onForceAdvance?: (stepIndex: number, reason: string) => Promise<void>;
}

const stepIcon = (status: string) => {
  switch (status) {
    case "completed": return <CheckCircle2 className="h-4 w-4 text-status-success shrink-0" />;
    case "in-progress": return <Loader2 className="h-4 w-4 text-status-info animate-spin shrink-0" />;
    case "failed": return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
    default: return <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30 shrink-0" />;
  }
};

export function AdminClaimDetail({
  claim, open, onClose, onIntervene, onForceAdvance,
}: AdminClaimDetailProps) {
  const { toast } = useToast();
  const [imageOpen, setImageOpen] = useState(false);

  // Force Advance dialog state
  const [advanceDialogOpen, setAdvanceDialogOpen] = useState(false);
  const [advanceStepIndex, setAdvanceStepIndex] = useState<number | null>(null);
  const [advanceReason, setAdvanceReason] = useState("");
  const [advanceLoading, setAdvanceLoading] = useState(false);
  const [advancingIndex, setAdvancingIndex] = useState<number | null>(null);

  // Fraud re-analysis state
  const [fraudReanalyzing, setFraudReanalyzing] = useState(false);
  const [localFraudAnalysis, setLocalFraudAnalysis] = useState<FraudAnalysis | null | undefined>(undefined);

  // Disputes state
  const [disputes, setDisputes] = useState<Array<{
    id: string; step_state: string; reason: string; status: string; admin_note: string | null; created_at: string;
  }>>([]);
  const [disputeResolveOpen, setDisputeResolveOpen] = useState(false);
  const [resolveDisputeId, setResolveDisputeId] = useState<string | null>(null);
  const [resolveNote, setResolveNote] = useState("");
  const [resolveStatus, setResolveStatus] = useState<"resolved" | "rejected">("resolved");
  const [resolveLoading, setResolveLoading] = useState(false);

  useEffect(() => {
    if (!claim) return;
    setLocalFraudAnalysis(undefined); // reset when claim changes

    // Fetch disputes for this claim
    const fetchDisputes = async () => {
      const { data } = await supabase
        .from("claim_disputes" as any)
        .select("id, step_state, reason, status, admin_note, created_at")
        .eq("claim_id", claim.id)
        .order("created_at", { ascending: false });
      setDisputes((data as any) || []);
    };
    fetchDisputes();
  }, [claim?.id]);

  if (!claim) return null;

  const effectiveFraudAnalysis = localFraudAnalysis !== undefined ? localFraudAnalysis : claim.fraud_analysis;

  const handleFraudReanalysis = async () => {
    setFraudReanalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke("fraud-analysis", {
        body: { claim_id: claim.id },
      });
      if (error) throw error;
      // Refresh from DB
      const { data: refreshed } = await supabase
        .from("claims" as any)
        .select("fraud_analysis")
        .eq("id", claim.id)
        .maybeSingle();
      setLocalFraudAnalysis((refreshed as any)?.fraud_analysis ?? null);
      toast({ title: "Fraud analysis complete", description: "Results updated below." });
    } catch (err: any) {
      toast({ title: "Re-analysis failed", description: err.message, variant: "destructive" });
    }
    setFraudReanalyzing(false);
  };

  const handleResolveDispute = async () => {
    if (!resolveDisputeId) return;
    setResolveLoading(true);
    try {
      await supabase
        .from("claim_disputes" as any)
        .update({ status: resolveStatus, admin_note: resolveNote.trim() || null } as any)
        .eq("id", resolveDisputeId);
      setDisputes(prev => prev.map(d =>
        d.id === resolveDisputeId
          ? { ...d, status: resolveStatus, admin_note: resolveNote.trim() || null }
          : d
      ));
      toast({ title: `Dispute ${resolveStatus}`, description: "The user will see the updated status." });
      setDisputeResolveOpen(false);
      setResolveNote("");
      setResolveDisputeId(null);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setResolveLoading(false);
  };

  const progress = getClaimProgress(claim.status);
  const stateIdx = getStateIndex(claim.status as ClaimState);

  const infoItems = [
    { icon: FileText, label: "Policy ID", value: claim.policy_id },
    { icon: Car, label: "Vehicle", value: claim.vehicle_number },
    { icon: MapPin, label: "Location", value: claim.location },
    { icon: CalendarDays, label: "Filed On", value: new Date(claim.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) },
    { icon: User, label: "User ID", value: claim.user_id.slice(0, 12) + "…" },
    ...(claim.garage ? [{ icon: Building2, label: "Garage", value: claim.garage }] : []),
  ];

  const openAdvanceDialog = (timelineIndex: number) => {
    setAdvanceStepIndex(timelineIndex);
    setAdvanceReason("");
    setAdvanceDialogOpen(true);
  };

  const confirmForceAdvance = async () => {
    if (advanceStepIndex === null || !onForceAdvance || !advanceReason.trim()) return;
    setAdvanceLoading(true);
    setAdvancingIndex(advanceStepIndex);
    try {
      await onForceAdvance(advanceStepIndex, advanceReason.trim());
      setAdvanceDialogOpen(false);
      setAdvanceReason("");
      setAdvanceStepIndex(null);
    } finally {
      setAdvanceLoading(false);
      setAdvancingIndex(null);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onClose}>
        <SheetContent className="w-full sm:max-w-xl p-0 flex flex-col" side="right">
          {/* Header */}
          <SheetHeader className="px-6 pt-6 pb-4 border-b border-border">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <SheetTitle className="text-lg font-bold flex items-center gap-2 flex-wrap">
                  {claim.claim_number}
                  {claim.paused && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-status-warning/10 px-2 py-0.5 text-xs font-semibold text-status-warning">
                      <Pause className="h-3 w-3" /> Paused
                    </span>
                  )}
                </SheetTitle>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <StatusBadge status={claim.status} />
                </div>
              </div>
            </div>
            <SheetDescription className="mt-2 text-sm line-clamp-2">{claim.description}</SheetDescription>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="px-6 py-4 space-y-5">

              {/* Progress */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground font-medium">Overall Progress</span>
                  <span className="text-xs font-bold text-foreground">{progress}%</span>
                </div>
                <Progress value={progress} className="h-2" />
                <p className="text-xs text-muted-foreground mt-1">
                  Step {Math.min(stateIdx + 1, CLAIM_STATES.length)} of {CLAIM_STATES.length} — <span className="text-foreground font-medium">{STATE_LABELS[claim.status as ClaimState] || claim.status}</span>
                </p>
              </div>

              <Separator />

              {/* Claim Info */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Claim Information</p>
                <div className="grid grid-cols-2 gap-3">
                  {infoItems.map(item => (
                    <div key={item.label} className="flex items-start gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-primary/8 text-primary mt-0.5">
                        <item.icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] text-muted-foreground">{item.label}</p>
                        <p className="text-xs font-medium text-foreground truncate">{item.value}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Damage Photo */}
              {claim.damage_image_url && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Damage Photo</p>
                    <div
                      className="relative cursor-pointer rounded-lg overflow-hidden border border-border group"
                      onClick={() => setImageOpen(true)}
                    >
                      <img
                        src={claim.damage_image_url}
                        alt="Vehicle damage"
                        className="w-full h-40 object-cover group-hover:scale-105 transition-transform duration-300"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center">
                        <ImageIcon className="h-8 w-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                    </div>
                  </div>
                </>
              )}

              {/* Agent Timeline with Force Advance */}
              {claim.steps && claim.steps.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Agent Processing Timeline</p>
                      {onForceAdvance && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-status-warning/10 px-2 py-0.5 text-[10px] font-semibold text-status-warning border border-status-warning/20">
                          <FastForward className="h-2.5 w-2.5" /> Admin Override Available
                        </span>
                      )}
                    </div>
                    <TooltipProvider>
                      <div className="space-y-2">
                        {claim.steps.map((step, i) => {
                          const isPending = step.status === "pending";
                          const isInProgress = step.status === "in-progress";
                          const isFailed = step.status === "failed";
                          // Force advance is available on the currently active/stuck step:
                          // in-progress, pending (if it's the current pending_step), or failed
                          const isCurrentPending = isPending && i === claim.pending_step;
                          const canForceAdvance = onForceAdvance && (isInProgress || isFailed || isCurrentPending);
                          const isBeingAdvanced = advancingIndex === i;

                          // The CLAIM_STATE index this step corresponds to
                          const claimStateIndex = CLAIM_STATES.indexOf(step.state as ClaimState);

                          return (
                            <div
                              key={step.id}
                              className={`flex items-start gap-3 rounded-lg p-3 text-xs transition-colors ${
                                step.status === "completed" ? "bg-status-success/5" :
                                step.status === "in-progress" ? "bg-status-info/8 border border-status-info/20" :
                                step.status === "failed" ? "bg-destructive/5 border border-destructive/20" :
                                i === claim.pending_step ? "bg-status-warning/5 border border-status-warning/15" :
                                "opacity-50"
                              }`}
                            >
                              {stepIcon(step.status)}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <p className="font-semibold text-foreground truncate">{step.label}</p>
                                    {step.status === "in-progress" && (
                                      <span className="text-[9px] font-bold uppercase tracking-wider text-status-info bg-status-info/10 px-1.5 py-0.5 rounded-full">
                                        Active
                                      </span>
                                    )}
                                    {step.status === "failed" && (
                                      <span className="text-[9px] font-bold uppercase tracking-wider text-destructive bg-destructive/10 px-1.5 py-0.5 rounded-full">
                                        Failed
                                      </span>
                                    )}
                                    {isCurrentPending && (
                                      <span className="text-[9px] font-bold uppercase tracking-wider text-status-warning bg-status-warning/10 px-1.5 py-0.5 rounded-full">
                                        Stuck
                                      </span>
                                    )}
                                  </div>
                                  {step.timestamp && (
                                    <span className="text-[10px] text-muted-foreground whitespace-nowrap">{step.timestamp}</span>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground mt-0.5">{step.agent}</p>
                                {step.details && (
                                  <p className="text-[10px] text-muted-foreground/80 mt-1 line-clamp-3">{step.details}</p>
                                )}

                                {/* Force Advance button */}
                                {canForceAdvance && (
                                  <div className="mt-2">
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-6 px-2 text-[10px] gap-1 border-status-warning/50 text-status-warning hover:bg-status-warning/10 hover:text-status-warning hover:border-status-warning"
                                          disabled={isBeingAdvanced || advancingIndex !== null}
                                          onClick={() => openAdvanceDialog(claimStateIndex)}
                                        >
                                          {isBeingAdvanced
                                            ? <Loader2 className="h-3 w-3 animate-spin" />
                                            : <FastForward className="h-3 w-3" />
                                          }
                                          {isBeingAdvanced ? "Advancing…" : "Force Advance"}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs max-w-52">
                                        Manually push this claim to the next state. Requires a reason that is logged in the audit trail.
                                      </TooltipContent>
                                    </Tooltip>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </TooltipProvider>
                  </div>
                </>
              )}

              {/* Spare Parts */}
              {claim.spare_parts && claim.spare_parts.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <Package className="h-3.5 w-3.5" /> Spare Parts
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {claim.spare_parts.map((part: string) => (
                        <Badge key={part} variant="secondary" className="text-[10px] font-medium">
                          {part}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </>
              )}

              {/* Billing */}
              {claim.billing && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <IndianRupee className="h-3.5 w-3.5" /> Billing Summary
                    </p>
                    <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2">
                      {Object.entries(claim.billing)
                        .filter(([_, val]) => typeof val === "number")
                        .map(([key, val]) => {
                          const label = key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
                          const isHighlight = key === "customerPays" || key === "gross";
                          const isGreen = key === "insuranceCover";
                          return (
                            <div key={key} className={`flex justify-between text-xs ${isHighlight ? "border-t border-border pt-2 mt-2" : ""}`}>
                              <span className={isHighlight ? "font-bold text-foreground" : "text-muted-foreground"}>{label}</span>
                              <span className={`font-semibold ${isGreen ? "text-status-success" : isHighlight ? "text-foreground" : ""}`}>
                                ₹{(val as number).toLocaleString()}
                              </span>
                            </div>
                          );
                        })}
                      {claim.billing.invoiceNumber && (
                        <p className="text-[10px] text-muted-foreground pt-2 border-t border-border">
                          Invoice: {claim.billing.invoiceNumber}
                        </p>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* Fraud Analysis — Admin Only */}
              <Separator />
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1.5">
                    <ShieldAlert className="h-3.5 w-3.5" /> Fraud Analysis
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[10px] gap-1 border-primary/30 text-primary hover:bg-primary/8"
                    onClick={handleFraudReanalysis}
                    disabled={fraudReanalyzing}
                  >
                    {fraudReanalyzing
                      ? <><Loader2 className="h-3 w-3 animate-spin" /> Running…</>
                      : <><RefreshCw className="h-3 w-3" /> Re-run Analysis</>
                    }
                  </Button>
                </div>
                {effectiveFraudAnalysis ? (
                  <FraudAnalysisPanel analysis={effectiveFraudAnalysis} />
                ) : (
                  <div className="rounded-lg border border-border bg-muted/20 p-4 text-center">
                    <p className="text-xs text-muted-foreground">No fraud analysis data yet.</p>
                    <p className="text-[10px] text-muted-foreground mt-1">Click "Re-run Analysis" to trigger AI fraud detection.</p>
                  </div>
                )}
              </div>

              {/* Disputes — Admin View */}
              {disputes.length > 0 && (
                <>
                  <Separator />
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <AlertTriangle className="h-3.5 w-3.5 text-status-warning" /> User Disputes ({disputes.length})
                    </p>
                    <div className="space-y-2">
                      {disputes.map((d) => (
                        <div key={d.id} className="rounded-lg border border-border bg-muted/20 p-3 text-xs">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <span className="font-semibold text-foreground">{STATE_LABELS[d.step_state as ClaimState] || d.step_state}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${
                              d.status === "pending" ? "bg-status-warning/10 text-status-warning"
                              : d.status === "resolved" ? "bg-status-success/10 text-status-success"
                              : "bg-destructive/10 text-destructive"
                            }`}>
                              {d.status}
                            </span>
                          </div>
                          <p className="text-muted-foreground line-clamp-2">{d.reason}</p>
                          {d.admin_note && (
                            <p className="mt-1 text-foreground italic">Admin: {d.admin_note}</p>
                          )}
                          {d.status === "pending" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 px-2 mt-2 text-[10px] gap-1"
                              onClick={() => {
                                setResolveDisputeId(d.id);
                                setResolveNote("");
                                setResolveStatus("resolved");
                                setDisputeResolveOpen(true);
                              }}
                            >
                              Resolve
                            </Button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          </ScrollArea>

          {/* Footer Actions */}
          <div className="px-6 py-4 border-t border-border flex gap-2">
            <Button
              variant="default"
              size="sm"
              className="flex-1"
              onClick={onIntervene}
            >
              Admin Intervene
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link to={`/claim/${claim.id}`} target="_blank">
                <ExternalLink className="h-3.5 w-3.5 mr-1" /> Full View
              </Link>
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Full-size image dialog */}
      {imageOpen && claim.damage_image_url && (
        <div
          className="fixed inset-0 z-[200] bg-black/80 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setImageOpen(false)}
        >
          <img
            src={claim.damage_image_url}
            alt="Damage"
            className="max-w-full max-h-[90vh] rounded-lg object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}

      {/* Force Advance confirmation dialog */}
      <Dialog open={advanceDialogOpen} onOpenChange={val => { if (!advanceLoading) setAdvanceDialogOpen(val); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FastForward className="h-4 w-4 text-status-warning" />
              Force Advance Claim
            </DialogTitle>
            <DialogDescription>
              This will manually advance{" "}
              <span className="font-semibold text-foreground">{claim.claim_number}</span>{" "}
              from{" "}
              <span className="font-semibold text-foreground">
                {advanceStepIndex !== null ? STATE_LABELS[CLAIM_STATES[advanceStepIndex]] : "—"}
              </span>{" "}
              to{" "}
              <span className="font-semibold text-status-warning">
                {advanceStepIndex !== null && advanceStepIndex + 1 < CLAIM_STATES.length
                  ? STATE_LABELS[CLAIM_STATES[advanceStepIndex + 1]]
                  : "—"}
              </span>
              . This override will be permanently logged in the audit trail.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">
                Reason for override <span className="text-destructive">*</span>
              </label>
              <Textarea
                value={advanceReason}
                onChange={e => setAdvanceReason(e.target.value)}
                placeholder="e.g. Agent has been stuck for 10+ minutes, manually verified eligibility via phone…"
                className="text-sm resize-none"
                rows={3}
                disabled={advanceLoading}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Min. 10 characters. This note will appear in the audit log.</p>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdvanceDialogOpen(false)}
              disabled={advanceLoading}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              className="bg-status-warning text-white hover:bg-status-warning/90 gap-1.5"
              disabled={advanceLoading || advanceReason.trim().length < 10}
              onClick={confirmForceAdvance}
            >
              {advanceLoading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Advancing…</>
                : <><FastForward className="h-3.5 w-3.5" /> Confirm Force Advance</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dispute Resolve Dialog */}
      <Dialog open={disputeResolveOpen} onOpenChange={val => { if (!resolveLoading) setDisputeResolveOpen(val); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-status-warning" />
              Resolve Dispute
            </DialogTitle>
            <DialogDescription>
              Provide a resolution note and mark the dispute as resolved or rejected.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="flex gap-2">
              {(["resolved", "rejected"] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setResolveStatus(s)}
                  className={`flex-1 py-2 px-3 rounded-lg border text-xs font-semibold capitalize transition-all ${
                    resolveStatus === s
                      ? s === "resolved"
                        ? "bg-status-success/10 border-status-success text-status-success"
                        : "bg-destructive/10 border-destructive text-destructive"
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
            <div>
              <label className="text-xs font-medium text-foreground mb-1.5 block">
                Admin note <span className="text-muted-foreground font-normal">(optional — shown to user)</span>
              </label>
              <Textarea
                value={resolveNote}
                onChange={e => setResolveNote(e.target.value)}
                placeholder="Explain your decision to the user…"
                className="text-sm resize-none"
                rows={3}
                disabled={resolveLoading}
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" size="sm" onClick={() => setDisputeResolveOpen(false)} disabled={resolveLoading}>
              Cancel
            </Button>
            <Button
              size="sm"
              className={resolveStatus === "resolved" ? "bg-status-success text-white hover:bg-status-success/90" : "bg-destructive text-white"}
              onClick={handleResolveDispute}
              disabled={resolveLoading}
            >
              {resolveLoading
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                : `Mark as ${resolveStatus}`
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
