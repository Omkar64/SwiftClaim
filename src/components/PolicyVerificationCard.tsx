import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ShieldCheck, ShieldAlert, FileText, CheckCircle2, XCircle, AlertTriangle, Wrench, Ban } from "lucide-react";

export interface PolicyVerification {
  is_authentic?: boolean;
  authenticity_reason?: string;
  document_policy_number?: string;
  document_vehicle_number?: string;
  policy_holder_name?: string;
  insurer_name?: string;
  policy_id_match?: boolean;
  vehicle_match?: boolean;
  coverage_type?: string;
  sum_insured_inr?: number;
  deductible_inr?: number;
  add_ons?: string[];
  covered_parts?: string[];
  excluded_parts?: string[];
  conditions?: string[];
  summary?: string;
  decision?: "ELIGIBLE" | "PARTIAL_COVERAGE" | "NOT_ELIGIBLE" | string;
  decision_reason?: string;
}

interface Props {
  verification: PolicyVerification;
}

export function PolicyVerificationCard({ verification: v }: Props) {
  const decision = v.decision || "";
  const decisionColor =
    decision === "ELIGIBLE"
      ? "bg-status-success/10 text-status-success border-status-success/30"
      : decision === "PARTIAL_COVERAGE"
        ? "bg-status-warning/10 text-status-warning border-status-warning/30"
        : "bg-destructive/10 text-destructive border-destructive/30";

  const Check = ({ ok, label }: { ok?: boolean; label: string }) => (
    <div className="flex items-center gap-2 text-sm">
      {ok ? (
        <CheckCircle2 className="h-4 w-4 text-status-success shrink-0" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive shrink-0" />
      )}
      <span className={ok ? "text-foreground" : "text-destructive font-medium"}>{label}</span>
    </div>
  );

  return (
    <Card className="shadow-card animate-slide-up border-primary/20" style={{ animationDelay: "260ms" }}>
      <CardHeader>
        <CardTitle className="text-lg flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" /> Policy Verification
          </span>
          {decision && (
            <Badge variant="outline" className={`text-[11px] font-bold ${decisionColor}`}>
              {decision.replace(/_/g, " ")}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Authenticity */}
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="flex items-center gap-2 mb-1.5">
            {v.is_authentic ? (
              <ShieldCheck className="h-4 w-4 text-status-success" />
            ) : (
              <ShieldAlert className="h-4 w-4 text-destructive" />
            )}
            <span className="text-sm font-semibold text-foreground">
              {v.is_authentic ? "Genuine policy document" : "Document failed authenticity check"}
            </span>
          </div>
          {v.authenticity_reason && (
            <p className="text-xs text-muted-foreground">{v.authenticity_reason}</p>
          )}
        </div>

        {/* Identity matches */}
        <div className="space-y-2">
          <Check
            ok={v.policy_id_match}
            label={`Policy number ${v.document_policy_number ? `"${v.document_policy_number}"` : ""} ${v.policy_id_match ? "matches stated policy" : "does NOT match stated policy"}`}
          />
          <Check
            ok={v.vehicle_match}
            label={`Vehicle ${v.document_vehicle_number ? `"${v.document_vehicle_number}"` : ""} ${v.vehicle_match ? "matches claim" : "does NOT match claim"}`}
          />
        </div>

        {/* Document facts */}
        <div className="grid grid-cols-2 gap-2 text-sm">
          {v.insurer_name && (
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Insurer</p>
              <p className="font-medium text-foreground truncate">{v.insurer_name}</p>
            </div>
          )}
          {v.policy_holder_name && (
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Insured</p>
              <p className="font-medium text-foreground truncate">{v.policy_holder_name}</p>
            </div>
          )}
          {v.coverage_type && (
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Coverage</p>
              <p className="font-medium text-foreground">{v.coverage_type}</p>
            </div>
          )}
          {!!v.sum_insured_inr && (
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Sum insured</p>
              <p className="font-medium text-foreground">₹{v.sum_insured_inr.toLocaleString("en-IN")}</p>
            </div>
          )}
          {!!v.deductible_inr && (
            <div className="rounded-md bg-muted/40 px-3 py-2">
              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Deductible</p>
              <p className="font-medium text-foreground">₹{v.deductible_inr.toLocaleString("en-IN")}</p>
            </div>
          )}
        </div>

        {v.add_ons && v.add_ons.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Add-ons</p>
            <div className="flex flex-wrap gap-1.5">
              {v.add_ons.map((a) => (
                <Badge key={a} variant="secondary" className="text-[11px]">{a}</Badge>
              ))}
            </div>
          </div>
        )}

        {/* Covered parts */}
        <div>
          <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Wrench className="h-3.5 w-3.5 text-status-success" /> Claimable parts under your policy
          </p>
          {v.covered_parts && v.covered_parts.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {v.covered_parts.map((p) => (
                <Badge
                  key={p}
                  variant="outline"
                  className="bg-status-success/10 text-status-success border-status-success/30 text-[11px]"
                >
                  ✓ {p}
                </Badge>
              ))}
            </div>
          ) : (
            <p className="text-xs text-muted-foreground italic">No claimable parts identified.</p>
          )}
        </div>

        {/* Excluded */}
        {v.excluded_parts && v.excluded_parts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-foreground uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Ban className="h-3.5 w-3.5 text-destructive" /> Not covered
            </p>
            <div className="flex flex-wrap gap-1.5">
              {v.excluded_parts.map((p) => (
                <Badge
                  key={p}
                  variant="outline"
                  className="bg-destructive/10 text-destructive border-destructive/30 text-[11px]"
                >
                  ✗ {p}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {v.conditions && v.conditions.length > 0 && (
          <div className="rounded-lg border border-status-warning/30 bg-status-warning/5 p-3">
            <p className="text-xs font-semibold text-status-warning uppercase tracking-wide mb-1.5 flex items-center gap-1.5">
              <AlertTriangle className="h-3.5 w-3.5" /> Conditions
            </p>
            <ul className="space-y-1">
              {v.conditions.map((c) => (
                <li key={c} className="text-xs text-foreground flex items-start gap-1.5">
                  <span className="text-status-warning mt-0.5">•</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {v.summary && (
          <div className="rounded-lg border border-border bg-muted/30 p-3">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
              <FileText className="h-3 w-3" /> Agent summary
            </p>
            <p className="text-xs text-foreground leading-relaxed">{v.summary}</p>
            {v.decision_reason && (
              <p className="text-xs text-muted-foreground mt-2 italic">→ {v.decision_reason}</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
