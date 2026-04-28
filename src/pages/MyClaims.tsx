import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { FileText, Plus, ArrowRight, Clock, CheckCircle2, TrendingUp, IndianRupee } from "lucide-react";
import { getClaimProgress } from "@/lib/claimStateMachine";

interface ClaimRow {
  id: string;
  claim_number: string;
  policy_id: string;
  vehicle_number: string;
  description: string;
  location: string;
  status: string;
  created_at: string;
  billing: Record<string, number | string> | null;
}

export default function MyClaims() {
  const { user } = useAuth();
  const [claims, setClaims] = useState<ClaimRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchClaims = async () => {
      const { data } = await supabase
        .from("claims" as any)
        .select("id, claim_number, policy_id, vehicle_number, description, location, status, created_at, billing")
        .order("created_at", { ascending: false });
      setClaims((data as any as ClaimRow[]) || []);
      setLoading(false);
    };

    fetchClaims();

    const channel = supabase
      .channel("my-claims")
      .on("postgres_changes", { event: "*", schema: "public", table: "claims" }, () => {
        fetchClaims();
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user]);

  // Compute stats from loaded claims
  const activeClaims = claims.filter((c) => c.status !== "CLAIM_CLOSED" && c.status !== "rejected").length;
  const closedClaims = claims.filter((c) => c.status === "CLAIM_CLOSED").length;
  const totalSaved = claims
    .filter((c) => c.status === "CLAIM_CLOSED" && c.billing)
    .reduce((sum, c) => {
      const cover = (c.billing as any)?.insuranceCover;
      return sum + (typeof cover === "number" ? cover : 0);
    }, 0);

  if (loading) {
    return (
      <div className="container py-12 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
      </div>
    );
  }

  return (
    <div className="container py-12">
      <div className="flex items-center justify-between mb-8 animate-slide-up">
        <div>
          <h1 className="text-3xl font-bold text-foreground">My Claims</h1>
          <p className="mt-2 text-muted-foreground">Track all your insurance claims across 13 processing states</p>
        </div>
        <Button asChild>
          <Link to="/raise-claim"><Plus className="h-4 w-4 mr-2" /> New Claim</Link>
        </Button>
      </div>

      {/* Stats banner */}
      {claims.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8 animate-slide-up" style={{ animationDelay: "60ms" }}>
          {[
            {
              icon: Clock,
              label: "Active Claims",
              value: activeClaims,
              color: "text-status-info",
              bg: "bg-status-info/10",
            },
            {
              icon: CheckCircle2,
              label: "Claims Closed",
              value: closedClaims,
              color: "text-status-success",
              bg: "bg-status-success/10",
            },
            {
              icon: IndianRupee,
              label: "Total Insured Value Saved",
              value: totalSaved > 0 ? `₹${totalSaved.toLocaleString("en-IN")}` : "—",
              color: "text-primary",
              bg: "bg-primary/10",
            },
          ].map((stat) => (
            <Card key={stat.label} className="shadow-card">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${stat.bg} ${stat.color}`}>
                    <stat.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xl font-bold text-foreground">{stat.value}</p>
                    <p className="text-xs text-muted-foreground">{stat.label}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {claims.length === 0 ? (
        <Card className="shadow-card animate-slide-up">
          <CardContent className="py-16 text-center">
            <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-foreground">No Claims Yet</h3>
            <p className="text-muted-foreground mt-1">Submit your first insurance claim to get started.</p>
            <Button asChild className="mt-6">
              <Link to="/raise-claim">Raise a Claim</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4">
          {claims.map((claim, i) => {
            const progress = getClaimProgress(claim.status);
            return (
              <Card
                key={claim.id}
                className="shadow-card hover:shadow-elevated transition-shadow animate-slide-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <CardContent className="py-5">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1">
                        <h3 className="text-base font-semibold text-foreground">{claim.claim_number}</h3>
                        <StatusBadge status={claim.status} />
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-1">{claim.description}</p>
                      <div className="flex gap-4 mt-2 text-xs text-muted-foreground">
                        <span>Policy: {claim.policy_id}</span>
                        <span>Vehicle: {claim.vehicle_number}</span>
                        <span>{new Date(claim.created_at).toLocaleDateString()}</span>
                      </div>
                      <div className="mt-3 flex items-center gap-3">
                        <Progress value={progress} className="h-1.5 flex-1" />
                        <span className="text-xs text-muted-foreground font-medium">{progress}%</span>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button asChild variant="ghost" size="sm" className="text-muted-foreground">
                        <Link to={`/track/${claim.claim_number}`}>
                          <TrendingUp className="h-3.5 w-3.5 mr-1" /> Share
                        </Link>
                      </Button>
                      <Button asChild variant="outline" size="sm">
                        <Link to={`/claim/${claim.id}`}>
                          View <ArrowRight className="ml-1 h-3 w-3" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
