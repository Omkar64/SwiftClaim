import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CLAIM_STATES, STATE_LABELS, getStateIndex, type ClaimState } from "@/lib/claimStateMachine";
import { CheckCircle2, Loader2, Clock, Building2, Search, Share2, Copy, Check, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import QRCode from "qrcode";

interface PublicStep {
  id: string;
  state: string;
  label: string;
  agent: string;
  status: string;
  timestamp?: string;
}

interface PublicClaimData {
  claim_number: string;
  status: string;
  garage: string | null;
  created_at: string;
  steps: PublicStep[];
}

export default function PublicClaimTracker() {
  const { claimNumber: paramClaimNumber } = useParams<{ claimNumber?: string }>();
  const { toast } = useToast();
  const [searchInput, setSearchInput] = useState(paramClaimNumber || "");
  const [claim, setClaim] = useState<PublicClaimData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState("");

  const fetchClaim = async (claimNum: string) => {
    if (!claimNum.trim()) return;
    setLoading(true);
    setError(null);
    setClaim(null);
    try {
      const SUPABASE_URL = "https://smgduxxzbfugpyonhmyt.supabase.co";
      const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_-RHN7hmgdBLbYVYrs9aNzw_FT8YdvXc";
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/get-public-claim?claim_number=${encodeURIComponent(claimNum.trim())}`,
        {
          headers: {
            apikey: SUPABASE_PUBLISHABLE_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      const json = await res.json();
      if (!res.ok || json.error) {
        setError(json.error || "Claim not found");
      } else {
        setClaim(json);
      }
    } catch {
      setError("Failed to fetch claim. Please try again.");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (paramClaimNumber) fetchClaim(paramClaimNumber);
  }, [paramClaimNumber]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    fetchClaim(searchInput);
  };

  const handleCopyLink = async () => {
    const url = `${window.location.origin}/track/${claim?.claim_number}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: "Link copied!", description: "Share this link with your garage or family." });
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

  const currentStateIndex = claim ? getStateIndex(claim.status as ClaimState) : -1;
  const progress = claim
    ? Math.round(((currentStateIndex + 1) / CLAIM_STATES.length) * 100)
    : 0;

  return (
    <div className="container max-w-2xl py-12">
      <div className="mb-8 animate-slide-up text-center">
        <h1 className="text-3xl font-bold text-foreground">Track a Claim</h1>
        <p className="mt-2 text-muted-foreground">No login required — share with garages or family</p>
      </div>

      {/* Search form */}
      <Card className="shadow-elevated mb-8 animate-slide-up" style={{ animationDelay: "60ms" }}>
        <CardContent className="py-5">
          <form onSubmit={handleSearch} className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-10"
                placeholder="Enter claim number, e.g. CLM-2026-12345"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
              />
            </div>
            <Button type="submit" disabled={loading || !searchInput.trim()}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Track"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Error state */}
      {error && !loading && (
        <Card className="shadow-card border-destructive/30 animate-slide-up">
          <CardContent className="py-8 text-center">
            <p className="text-destructive font-medium">{error}</p>
            <p className="text-sm text-muted-foreground mt-1">Check the claim number and try again.</p>
          </CardContent>
        </Card>
      )}

      {/* Claim result */}
      {claim && !loading && (
        <div className="space-y-6 animate-slide-up">
          {/* Header */}
          <Card className="shadow-elevated">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-xl font-bold text-foreground">{claim.claim_number}</CardTitle>
                  <p className="text-xs text-muted-foreground mt-1">
                    Filed on {new Date(claim.created_at).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={claim.status} />
                  <Button variant="outline" size="sm" onClick={handleCopyLink}>
                    {copied ? <Check className="h-3.5 w-3.5 mr-1 text-status-success" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                    {copied ? "Copied!" : "Share"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-0 space-y-4">
              {/* Progress bar */}
              <div>
                <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
                  <span>Overall Progress</span>
                  <span className="font-semibold text-foreground">{progress}%</span>
                </div>
                <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-all duration-700"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Garage info */}
              {claim.garage && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Building2 className="h-4 w-4 shrink-0" />
                  <span>Assigned Garage: <span className="font-medium text-foreground">{claim.garage}</span></span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Timeline */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">13-State Pipeline Progress</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="relative">
                {CLAIM_STATES.map((state, i) => {
                  const step = claim.steps.find((s) => s.state === state);
                  const stepStatus = step?.status || "pending";
                  const isCompleted = stepStatus === "completed";
                  const isActive = stepStatus === "in-progress";
                  const isCurrent = state === claim.status;

                  return (
                    <div key={state} className="flex gap-3 group">
                      <div className="flex flex-col items-center">
                        <div
                          className={cn(
                            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-all",
                            isCompleted
                              ? "bg-status-success text-status-success-foreground"
                              : isActive
                              ? "bg-primary text-primary-foreground animate-pulse"
                              : isCurrent
                              ? "bg-primary/20 border-2 border-primary text-primary"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4" />
                          ) : isActive ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            i + 1
                          )}
                        </div>
                        {i < CLAIM_STATES.length - 1 && (
                          <div
                            className={cn(
                              "w-0.5 flex-1 min-h-[1.25rem]",
                              isCompleted ? "bg-status-success" : "bg-border"
                            )}
                          />
                        )}
                      </div>
                      <div className="pb-4 pt-0.5 flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p
                            className={cn(
                              "text-sm font-medium leading-tight",
                              isCompleted
                                ? "text-status-success"
                                : isActive || isCurrent
                                ? "text-foreground"
                                : "text-muted-foreground"
                            )}
                          >
                            {STATE_LABELS[state]}
                          </p>
                          {isActive && (
                            <span className="text-[9px] font-bold uppercase bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                              Processing
                            </span>
                          )}
                          {step?.timestamp && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Clock className="h-2.5 w-2.5" /> {step.timestamp}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">{step?.agent || ""}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Share section */}
          <Card className="shadow-card border-primary/20 bg-primary/3">
            <CardContent className="py-4 flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-2">
                <Share2 className="h-4 w-4 text-primary" />
                <p className="text-sm font-medium text-foreground">Share this tracker</p>
                <p className="text-xs text-muted-foreground">with your garage or insurance agent</p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handleShowQR}>
                  <QrCode className="h-3.5 w-3.5 mr-1" /> QR Code
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopyLink}>
                  {copied ? <Check className="h-3.5 w-3.5 mr-1 text-status-success" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
                  Copy Link
                </Button>
              </div>
            </CardContent>
          </Card>

          <div className="text-center">
            <p className="text-xs text-muted-foreground">
              Want full details?{" "}
              <Link to="/auth" className="text-primary underline underline-offset-2">
                Sign in
              </Link>{" "}
              to your account.
            </p>
          </div>
        </div>
      )}

      {/* QR Modal */}
      <Dialog open={qrOpen} onOpenChange={setQrOpen}>
        <DialogContent className="max-w-xs text-center">
          <DialogHeader>
            <DialogTitle className="flex items-center justify-center gap-2">
              <QrCode className="h-5 w-5" /> Scan to Track
            </DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-4 py-2">
            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR code" className="rounded-xl border border-border w-52 h-52" />
            )}
            <p className="text-sm text-muted-foreground">
              Share with garage or family to track <strong>{claim?.claim_number}</strong>
            </p>
            <Button variant="outline" size="sm" onClick={handleCopyLink}>
              {copied ? <Check className="h-3.5 w-3.5 mr-1 text-status-success" /> : <Copy className="h-3.5 w-3.5 mr-1" />}
              Copy Link
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
