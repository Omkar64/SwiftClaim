import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { AgentTimeline } from "@/components/AgentTimeline";
import { ClaimStateTimeline } from "@/components/ClaimStateTimeline";
import { DisputeDialog } from "@/components/DisputeDialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MapPin, Car, FileText, Building2, Package, IndianRupee, ShieldCheck, FileOutput, CheckCircle, ArrowRight, Clock, Sparkles, Download, Share2, AlertTriangle, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { ClaimStep } from "@/lib/claimStateMachine";
import { CLAIM_STATES, STATE_LABELS, getStateIndex, type ClaimState } from "@/lib/claimStateMachine";
import { cn } from "@/lib/utils";
import { useAgentETA } from "@/hooks/useAgentETA";
import { generateClaimPDF } from "@/lib/generateClaimPDF";
import { resolveStorageUrl } from "@/lib/storageUrls";
import QRCode from "qrcode";

import { PolicyVerificationCard, type PolicyVerification } from "@/components/PolicyVerificationCard";

interface ClaimData {
  id: string;
  claim_number: string;
  policy_id: string;
  vehicle_number: string;
  description: string;
  location: string;
  status: string;
  garage: string | null;
  spare_parts: string[];
  billing: Record<string, number | string> | null;
  steps: ClaimStep[];
  created_at: string;
  damage_image_url: string | null;
  awaiting_confirmation: boolean;
  pending_step: number;
  policy_verification: PolicyVerification | null;
}

// Human-readable message shown while a specific agent is running
const AGENT_PROCESSING_LABELS: Partial<Record<ClaimState, string>> = {
  REGISTERED:           "Claim Intake Agent is validating your submission…",
  ELIGIBILITY_VERIFIED: "Eligibility Agent is reviewing your policy…",
  DAMAGE_ASSESSED:      "Damage Assessment Agent is analysing the photo…",
  GARAGE_ASSIGNED:      "Garage Assignment Agent is finding the nearest garage…",
  SURVEY_COMPLETED:     "Surveyor Agent is identifying spare parts…",
  INVENTORY_CONFIRMED:  "Inventory Agent is checking warehouse stock…",
  PARTS_DISPATCHED:     "Logistics Agent is dispatching parts to the garage…",
  PARTS_DELIVERED:      "Logistics Agent is confirming parts delivery…",
  REPAIR_COMPLETED:     "Repair Tracking Agent is verifying the repair…",
  BILL_GENERATED:       "Billing Agent is generating the invoice…",
  PAYMENT_CONFIRMED:    "Accounts Agent is processing payment…",
  GATE_PASS_ISSUED:     "Accounts Agent is issuing the gate pass…",
  CLAIM_CLOSED:         "System is closing the claim…",
};

export default function ClaimDetail() {
  const { claimId } = useParams();
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [claim, setClaim] = useState<ClaimData | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentProcessing, setPaymentProcessing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>("");
  const [damageImageUrl, setDamageImageUrl] = useState<string | null>(null);

  const handleDownloadPDF = async () => {
    if (!claim) return;
    setPdfLoading(true);
    try {
      await generateClaimPDF(claim);
    } catch (err: any) {
      toast({ title: "PDF generation failed", description: err.message, variant: "destructive" });
    } finally {
      setPdfLoading(false);
    }
  };

  const handleShowQR = async () => {
    if (!claim) return;
    const url = `${window.location.origin}/track/${claim.claim_number}`;
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 280, margin: 2 });
      setQrDataUrl(dataUrl);
      setQrOpen(true);
    } catch {
      toast({ title: "QR generation failed", variant: "destructive" });
    }
  };
  // agentRunning holds the state currently being processed by the edge function
  const [agentRunning, setAgentRunning] = useState<ClaimState | null>(null);
  // Safety-valve: auto-clear the banner after 90 s if DB update never arrives
  const agentTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { averages: averageDurations, sampleCounts } = useAgentETA();

  /** Start the "processing" banner and set a safety-valve timeout */
  const startAgentIndicator = (state: ClaimState) => {
    if (agentTimeoutRef.current) clearTimeout(agentTimeoutRef.current);
    setAgentRunning(state);
    agentTimeoutRef.current = setTimeout(() => setAgentRunning(null), 90_000);
  };

  /** Clear the indicator (called when realtime update arrives) */
  const stopAgentIndicator = () => {
    if (agentTimeoutRef.current) clearTimeout(agentTimeoutRef.current);
    setAgentRunning(null);
  };

  const handleRetryStep = async (stepIndex: number) => {
    if (!claim) return;
    const targetState = CLAIM_STATES[stepIndex] as ClaimState;
    startAgentIndicator(targetState);
    const { error } = await supabase.functions.invoke("process-claim", {
      body: { claim_id: claim.id, start_step: stepIndex, retry_step: true },
    });
    if (error) {
      stopAgentIndicator();
      toast({ title: "Retry failed", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Agent re-triggered", description: `Step ${stepIndex + 1} is being re-processed.` });
    }
  };

  useEffect(() => {
    if (!claimId) return;

    const fetchClaim = async () => {
      const { data } = await supabase
        .from("claims" as any)
        .select("*")
        .eq("id", claimId)
        .maybeSingle();
      if (data) setClaim(data as any as ClaimData);
      setLoading(false);
    };

    fetchClaim();

    const channel = supabase
      .channel(`claim-${claimId}`)
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "claims",
        filter: `id=eq.${claimId}`,
      }, (payload) => {
        setClaim(payload.new as any as ClaimData);
        // DB updated → agent finished → clear the processing indicator
        stopAgentIndicator();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
      if (agentTimeoutRef.current) clearTimeout(agentTimeoutRef.current);
    };
  }, [claimId]);

  useEffect(() => {
    let cancelled = false;

    const loadDamageImage = async () => {
      if (!claim?.damage_image_url) {
        setDamageImageUrl(null);
        return;
      }

      const signedUrl = await resolveStorageUrl("claim-images", claim.damage_image_url);
      if (!cancelled) setDamageImageUrl(signedUrl);
    };

    loadDamageImage();

    return () => {
      cancelled = true;
    };
  }, [claim?.damage_image_url]);

  const handleConfirmStep = async () => {
    if (!claim) return;
    setConfirming(true);

    try {
      const currentIdx = getStateIndex(claim.status as ClaimState);
      const nextIdx = currentIdx + 1;

      if (nextIdx >= CLAIM_STATES.length) return;

      const nextState = CLAIM_STATES[nextIdx] as ClaimState;

      // Show processing indicator for the upcoming state
      startAgentIndicator(nextState);

      // Mark current as confirmed
      await supabase.from("claims" as any).update({
        awaiting_confirmation: false,
      } as any).eq("id", claim.id);

      // Trigger next agent step (fire and forget — realtime will clear the indicator)
      supabase.functions.invoke("process-claim", {
        body: { claim_id: claim.id, start_step: nextIdx },
      }).catch((err) => {
        stopAgentIndicator();
        console.error(err);
      });

      toast({ title: "Confirmed", description: `Moving to ${STATE_LABELS[nextState]}…` });
    } catch (err: any) {
      stopAgentIndicator();
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setConfirming(false);
  };

  const handlePayment = async () => {
    if (!claim) return;
    setPaymentProcessing(true);
    startAgentIndicator("PAYMENT_CONFIRMED");

    try {
      const { data, error } = await supabase.functions.invoke("process-claim", {
        body: { claim_id: claim.id, start_step: 10 },
      });

      if (error) throw error;

      const gatePass = data?.gate_pass || "GP-2026-XXXXX";
      toast({ title: "Payment Confirmed", description: `Gate Pass ${gatePass} issued. Vehicle ready for pickup.` });
    } catch (err: any) {
      stopAgentIndicator();
      toast({ title: "Error", description: err.message || "Payment failed", variant: "destructive" });
    }
    setPaymentProcessing(false);
  };

  if (loading) {
    return (
      <div className="container py-12 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="container py-12 text-center">
        <h2 className="text-xl font-bold text-foreground">Claim not found</h2>
      </div>
    );
  }

  const isBillGenerated = claim.status === "BILL_GENERATED";
  const isPastBilling = getStateIndex(claim.status as any) >= getStateIndex("PAYMENT_CONFIRMED");
  const showPaymentButton = isAdmin && isBillGenerated && !isPastBilling;
  const showPaymentWaiting = !isAdmin && isBillGenerated && !isPastBilling;
  const showConfirmButton = claim.awaiting_confirmation && !isBillGenerated && claim.status !== "BILL_GENERATED";

  const infoItems = [
    { icon: FileText, label: "Policy ID", value: claim.policy_id },
    { icon: Car, label: "Vehicle", value: claim.vehicle_number },
    { icon: MapPin, label: "Location", value: claim.location },
    ...(claim.garage ? [{ icon: Building2, label: "Assigned Garage", value: claim.garage }] : []),
  ];

  // Message shown in the processing banner
  const processingLabel = agentRunning
    ? (AGENT_PROCESSING_LABELS[agentRunning] ?? `${agentRunning.replace(/_/g, " ")} in progress…`)
    : null;

  // Animated dots helper rendered inline
  const Dots = () => (
    <span className="inline-flex gap-0.5 ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 rounded-full bg-current animate-bounce"
          style={{ animationDelay: `${i * 150}ms`, animationDuration: "900ms" }}
        />
      ))}
    </span>
  );

  return (
    <div className="container py-12">
      <div className="mb-8 animate-slide-up">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold text-foreground">{claim.claim_number}</h1>
          <StatusBadge status={claim.status} />
          {/* Share tracker link */}
          <Button
            variant="outline"
            size="sm"
            asChild
            className="flex items-center gap-1.5"
          >
            <Link to={`/track/${claim.claim_number}`} target="_blank">
              <Share2 className="h-3.5 w-3.5" /> Public Tracker
            </Link>
          </Button>
          {/* QR Code share */}
          <Button
            variant="outline"
            size="sm"
            onClick={handleShowQR}
            className="flex items-center gap-1.5"
          >
            <QrCode className="h-3.5 w-3.5" /> Share via QR
          </Button>
          {claim.status === "CLAIM_CLOSED" && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDownloadPDF}
              disabled={pdfLoading}
              className="ml-auto flex items-center gap-2 border-status-success text-status-success hover:bg-status-success/10"
            >
              {pdfLoading ? (
                <>
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-status-success border-t-transparent" />
                  Generating…
                </>
              ) : (
                <>
                  <Download className="h-3.5 w-3.5" />
                  Download PDF Summary
                </>
              )}
            </Button>
          )}
        </div>
        <p className="mt-2 text-muted-foreground">{claim.description}</p>
      </div>

      {/* ── Live Agent Processing Banner ── */}
      <div
        className={cn(
          "mb-6 overflow-hidden transition-all duration-500 ease-in-out",
          agentRunning ? "max-h-28 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
        )}
      >
        <div className="rounded-xl border border-primary/25 bg-primary/5 px-5 py-4 flex items-center gap-4 shadow-sm">
          {/* Pulsing glow orb */}
          <div className="relative flex shrink-0 h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-5 w-5 text-primary" />
            <span className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-primary leading-tight flex items-center flex-wrap gap-1">
              Agent is processing
              <Dots />
            </p>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              {processingLabel}
            </p>
          </div>
          {/* Animated shimmer bar */}
          <div className="hidden sm:block w-36 h-1.5 rounded-full bg-primary/15 overflow-hidden shrink-0">
            <div className="h-full w-1/2 rounded-full bg-primary/50 animate-[shimmer_1.6s_ease-in-out_infinite]" />
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* State Machine Progress */}
        <div className="lg:col-span-1">
          <Card className="shadow-card animate-slide-up sticky top-20">
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Claim States
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ClaimStateTimeline currentState={claim.status} />
            </CardContent>
          </Card>
        </div>

        {/* Agent Timeline */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="shadow-card animate-slide-up" style={{ animationDelay: "80ms" }}>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg">Agent Processing Timeline</CardTitle>
                {!isAdmin && claim.steps && claim.steps.some(s => s.status === "completed") && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-status-warning border-status-warning/40 hover:bg-status-warning/10 gap-1.5"
                    onClick={() => setDisputeOpen(true)}
                  >
                    <AlertTriangle className="h-3.5 w-3.5" /> Raise a Dispute
                  </Button>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {claim.steps && claim.steps.length > 0 ? (
                <AgentTimeline
                  steps={claim.steps}
                  isAdmin={isAdmin}
                  onRetryStep={isAdmin ? handleRetryStep : undefined}
                  averageDurations={averageDurations}
                />
              ) : (
                <p className="text-muted-foreground text-sm">Processing will begin shortly…</p>
              )}
            </CardContent>
          </Card>

          {/* Confirm Step Button */}
          {showConfirmButton && (
            <Card className="shadow-elevated border-status-info/30 animate-slide-up">
              <CardContent className="py-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground flex items-center gap-2">
                      <CheckCircle className="h-5 w-5 text-status-info" /> Review & Confirm
                    </h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      The <strong>{STATE_LABELS[claim.status as ClaimState]}</strong> agent has completed processing. Review the details above and confirm to proceed to the next step.
                    </p>
                  </div>
                  <Button size="lg" onClick={handleConfirmStep} disabled={confirming || !!agentRunning}>
                    {confirming ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        Confirming…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        Confirm & Proceed <ArrowRight className="h-4 w-4" />
                      </span>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment Action - Admin Only */}
          {showPaymentButton && claim.billing && (
            <Card className="shadow-elevated border-status-warning/30 animate-slide-up">
              <CardContent className="py-6">
                <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Payment Required</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Customer payable: <strong className="text-foreground">₹{((claim.billing as any)?.customerPays || 0).toLocaleString()}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Gate pass will only be issued after payment confirmation.
                    </p>
                  </div>
                  <Button size="lg" onClick={handlePayment} disabled={paymentProcessing}>
                    {paymentProcessing ? (
                      <span className="flex items-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                        Processing…
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <IndianRupee className="h-4 w-4" /> Confirm Payment
                      </span>
                    )}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Payment Waiting - Regular Users */}
          {showPaymentWaiting && claim.billing && (
            <Card className="shadow-elevated border-status-warning/30 animate-slide-up">
              <CardContent className="py-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-status-warning/10 text-status-warning">
                    <Clock className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Awaiting Payment Confirmation</h3>
                    <p className="text-sm text-muted-foreground mt-1">
                      Customer payable: <strong className="text-foreground">₹{((claim.billing as any)?.customerPays || 0).toLocaleString()}</strong>
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Payment must be confirmed by an admin before the gate pass can be issued.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Gate Pass */}
          {getStateIndex(claim.status as any) >= getStateIndex("GATE_PASS_ISSUED") && (
            <Card className="shadow-elevated border-status-success/30 animate-slide-up">
              <CardContent className="py-6">
                <div className="flex items-center gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-status-success/10 text-status-success">
                    <FileOutput className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-foreground">Gate Pass Issued</h3>
                    <p className="text-sm text-muted-foreground">
                      Vehicle {claim.vehicle_number} is authorized for release from {claim.garage || "the assigned garage"}.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right sidebar */}
        <div className="space-y-6">
          <Card className="shadow-card animate-slide-up" style={{ animationDelay: "160ms" }}>
            <CardHeader>
              <CardTitle className="text-lg">Claim Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {infoItems.map(item => (
                <div key={item.label} className="flex items-start gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                    <p className="text-sm font-medium text-foreground">{item.value}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Damage Image */}
          {damageImageUrl && (
            <Card className="shadow-card animate-slide-up" style={{ animationDelay: "200ms" }}>
              <CardHeader>
                <CardTitle className="text-lg">Damage Photo</CardTitle>
              </CardHeader>
              <CardContent>
                <img src={damageImageUrl} alt="Vehicle damage" className="w-full rounded-lg object-cover" />
              </CardContent>
            </Card>
          )}

          {/* Structured policy verification — authenticity, coverage, claimable parts */}
          {claim.policy_verification && (
            <PolicyVerificationCard verification={claim.policy_verification} />
          )}

          {claim.spare_parts && claim.spare_parts.length > 0 && (
            <Card className="shadow-card animate-slide-up" style={{ animationDelay: "240ms" }}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Package className="h-4 w-4" /> Spare Parts
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {claim.spare_parts.map((part: string) => (
                    <li key={part} className="flex items-center gap-2 text-sm">
                      <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                      {part}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}

          {claim.billing && (
            <Card className="shadow-card animate-slide-up" style={{ animationDelay: "320ms" }}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <IndianRupee className="h-4 w-4" /> Billing Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(claim.billing)
                  .filter(([_, val]) => typeof val === "number")
                  .map(([key, val]) => {
                    const label = key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
                    const isHighlight = key === "customerPays" || key === "gross";
                    const isPositive = key === "insuranceCover";
                    return (
                      <div key={key} className={`flex justify-between text-sm ${isHighlight ? "border-t border-border pt-3" : ""}`}>
                        <span className={isHighlight ? "font-semibold" : "text-muted-foreground"}>{label}</span>
                        <span className={`font-medium ${isPositive ? "text-status-success" : ""} ${isHighlight ? "font-bold text-foreground" : ""}`}>
                          ₹{(val as number).toLocaleString()}
                        </span>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      {/* Dispute dialog */}
      <DisputeDialog
        open={disputeOpen}
        onClose={() => setDisputeOpen(false)}
        claimId={claim.id}
        claimNumber={claim.claim_number}
        completedSteps={claim.steps || []}
      />

      {/* QR Code Modal */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2">
              <QrCode className="h-5 w-5" /> Share Claim Tracker
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR code" className="rounded-xl border border-border w-52 h-52" />
            )}
            <p className="text-sm text-muted-foreground">
              Scan with any camera to track <strong>{claim.claim_number}</strong>
            </p>
            <p className="text-xs text-muted-foreground bg-muted/50 px-3 py-1.5 rounded-md break-all font-mono">
              {window.location.origin}/track/{claim.claim_number}
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(`${window.location.origin}/track/${claim.claim_number}`);
                toast({ title: "Link copied!" });
              }}
            >
              Copy Link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
