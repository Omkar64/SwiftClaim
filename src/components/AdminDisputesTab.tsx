import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CheckCircle2, XCircle, ExternalLink, Image, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface DisputeRow {
  id: string;
  claim_id: string;
  user_id: string;
  reason: string;
  step_state: string;
  status: string;
  counter_image_url: string | null;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
  // joined
  claim_number?: string;
}

export function AdminDisputesTab() {
  const { toast } = useToast();
  const [disputes, setDisputes] = useState<DisputeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolveOpen, setResolveOpen] = useState(false);
  const [selectedDispute, setSelectedDispute] = useState<DisputeRow | null>(null);
  const [resolveAction, setResolveAction] = useState<"resolved" | "rejected">("resolved");
  const [adminNote, setAdminNote] = useState("");
  const [processing, setProcessing] = useState(false);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const fetchDisputes = async () => {
    setLoading(true);
    const query = supabase
      .from("claim_disputes" as any)
      .select("*")
      .order("created_at", { ascending: false });

    if (filter === "pending") {
      query.eq("status", "pending");
    }

    const { data, error } = await query;
    if (error) {
      toast({ title: "Error", description: "Failed to load disputes", variant: "destructive" });
      setLoading(false);
      return;
    }

    // Fetch claim numbers for each dispute
    const disputes = (data as any as DisputeRow[]) || [];
    const claimIds = [...new Set(disputes.map(d => d.claim_id))];
    if (claimIds.length > 0) {
      const { data: claims } = await supabase
        .from("claims" as any)
        .select("id, claim_number")
        .in("id", claimIds);
      const claimMap = new Map((claims as any[] || []).map((c: any) => [c.id, c.claim_number]));
      disputes.forEach(d => { d.claim_number = claimMap.get(d.claim_id) || "Unknown"; });
    }

    setDisputes(disputes);
    setLoading(false);
  };

  useEffect(() => {
    fetchDisputes();
  }, [filter]);

  const handleResolve = async () => {
    if (!selectedDispute) return;
    setProcessing(true);
    try {
      const { error } = await supabase
        .from("claim_disputes" as any)
        .update({ status: resolveAction, admin_note: adminNote, updated_at: new Date().toISOString() } as any)
        .eq("id", selectedDispute.id);
      if (error) throw error;
      toast({
        title: resolveAction === "resolved" ? "Dispute Resolved" : "Dispute Rejected",
        description: `Dispute for ${selectedDispute.claim_number} has been ${resolveAction}.`,
      });
      setResolveOpen(false);
      setAdminNote("");
      setSelectedDispute(null);
      fetchDisputes();
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setProcessing(false);
  };

  const pendingCount = disputes.filter(d => d.status === "pending").length;
  const resolvedCount = disputes.filter(d => d.status === "resolved").length;
  const rejectedCount = disputes.filter(d => d.status === "rejected").length;

  const getStepLabel = (stepState: string) =>
    stepState.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  const statusConfig = {
    pending:  { cls: "bg-status-warning/10 text-status-warning border-status-warning/20", label: "Pending" },
    resolved: { cls: "bg-status-success/10 text-status-success border-status-success/20", label: "Resolved" },
    rejected: { cls: "bg-destructive/10 text-destructive border-destructive/20", label: "Rejected" },
  };

  return (
    <div className="space-y-6">
      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pending", value: pendingCount, color: "text-status-warning", bg: "bg-status-warning/10" },
          { label: "Resolved", value: resolvedCount, color: "text-status-success", bg: "bg-status-success/10" },
          { label: "Rejected", value: rejectedCount, color: "text-destructive", bg: "bg-destructive/10" },
        ].map(s => (
          <Card key={s.label} className="shadow-card">
            <CardContent className="py-4 flex items-center gap-3">
              <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", s.bg, s.color)}>
                <AlertTriangle className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter tabs */}
      <div className="flex rounded-lg border border-border bg-muted p-1 gap-1 w-fit">
        {(["pending", "all"] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={cn(
              "px-3 py-1.5 rounded-md text-sm font-medium transition-all capitalize",
              filter === f
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f === "pending" ? `Pending (${pendingCount})` : "All Disputes"}
          </button>
        ))}
      </div>

      {/* Disputes list */}
      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : disputes.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="py-12 text-center">
            <CheckCircle2 className="h-10 w-10 text-status-success mx-auto mb-3" />
            <p className="text-muted-foreground font-medium">
              {filter === "pending" ? "No pending disputes — inbox is clear!" : "No disputes found."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {disputes.map((dispute, i) => {
            const cfg = statusConfig[dispute.status as keyof typeof statusConfig] || statusConfig.pending;
            return (
              <Card
                key={dispute.id}
                className="shadow-card animate-slide-up hover:shadow-elevated transition-all"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <CardContent className="py-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-status-warning/10 text-status-warning mt-0.5">
                        <AlertTriangle className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-semibold text-foreground">{dispute.claim_number}</span>
                          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold", cfg.cls)}>
                            {cfg.label}
                          </span>
                          <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {getStepLabel(dispute.step_state)}
                          </span>
                          {dispute.counter_image_url && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] text-primary font-medium">
                              <Image className="h-2.5 w-2.5" /> Photo attached
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-foreground line-clamp-2">{dispute.reason}</p>
                        {dispute.admin_note && (
                          <p className="text-xs text-muted-foreground mt-1 italic">Admin note: {dispute.admin_note}</p>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {new Date(dispute.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 pl-12 sm:pl-0">
                      {dispute.counter_image_url && (
                        <Button variant="ghost" size="sm" asChild>
                          <a href={dispute.counter_image_url} target="_blank" rel="noopener noreferrer">
                            <ExternalLink className="h-3.5 w-3.5 mr-1" /> View Photo
                          </a>
                        </Button>
                      )}
                      {dispute.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-status-success border-status-success/30 hover:bg-status-success/10"
                            onClick={() => { setSelectedDispute(dispute); setResolveAction("resolved"); setResolveOpen(true); }}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Resolve
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => { setSelectedDispute(dispute); setResolveAction("rejected"); setResolveOpen(true); }}
                          >
                            <XCircle className="h-3.5 w-3.5 mr-1" /> Reject
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Resolve/Reject Dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {resolveAction === "resolved" ? "Resolve Dispute" : "Reject Dispute"} — {selectedDispute?.claim_number}
            </DialogTitle>
            <DialogDescription>
              Step disputed: <strong>{selectedDispute ? getStepLabel(selectedDispute.step_state) : ""}</strong>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {selectedDispute && (
              <div className="rounded-lg bg-muted/50 p-3 border border-border">
                <p className="text-xs text-muted-foreground mb-1">User's reason:</p>
                <p className="text-sm text-foreground">{selectedDispute.reason}</p>
              </div>
            )}
            <div className="space-y-2">
              <label className="text-sm font-medium">Admin Note <span className="text-muted-foreground font-normal">(will be visible to user)</span></label>
              <Textarea
                placeholder={resolveAction === "resolved" ? "Explain what action was taken..." : "Explain why the dispute is rejected..."}
                value={adminNote}
                onChange={(e) => setAdminNote(e.target.value)}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setResolveOpen(false); setAdminNote(""); }}>Cancel</Button>
            <Button
              variant={resolveAction === "rejected" ? "destructive" : "default"}
              onClick={handleResolve}
              disabled={processing || !adminNote.trim()}
            >
              {processing ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Processing...
                </span>
              ) : resolveAction === "resolved" ? "Confirm Resolve" : "Confirm Reject"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
