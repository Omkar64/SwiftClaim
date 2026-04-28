import { cn } from "@/lib/utils";
import { CLAIM_STATES, STATE_LABELS, type ClaimState, type StepStatus } from "@/lib/claimStateMachine";

const stepStatusConfig: Record<StepStatus, { className: string }> = {
  pending: { className: "bg-muted text-muted-foreground" },
  "in-progress": { className: "bg-status-info/10 text-status-info" },
  completed: { className: "bg-status-success/10 text-status-success" },
  failed: { className: "bg-destructive/10 text-destructive" },
};

function getClaimBadgeStyle(status: string): { label: string; className: string; dotClass: string } {
  const stateIdx = CLAIM_STATES.indexOf(status as ClaimState);

  if (status === "CLAIM_CLOSED") {
    return { label: "Closed", className: "bg-status-success/10 text-status-success", dotClass: "bg-status-success" };
  }
  if (status === "rejected") {
    return { label: "Rejected", className: "bg-destructive/10 text-destructive", dotClass: "bg-destructive" };
  }
  if (status === "FRAUD_SUSPECTED") {
    return { label: "🚫 Fraud Suspected", className: "bg-destructive/10 text-destructive", dotClass: "bg-destructive animate-pulse-soft" };
  }
  if (status === "NOT_ELIGIBLE") {
    return { label: "🚫 Not Eligible", className: "bg-destructive/10 text-destructive", dotClass: "bg-destructive" };
  }
  if (stateIdx >= 0) {
    return {
      label: STATE_LABELS[status as ClaimState],
      className: "bg-status-info/10 text-status-info",
      dotClass: "bg-status-info animate-pulse-soft",
    };
  }
  // fallback for legacy statuses
  if (status === "pending") return { label: "Pending", className: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground" };
  if (status === "completed") return { label: "Completed", className: "bg-status-success/10 text-status-success", dotClass: "bg-status-success" };
  return { label: status, className: "bg-muted text-muted-foreground", dotClass: "bg-muted-foreground" };
}

export function StatusBadge({ status, className: extraClass }: { status: string; className?: string }) {
  const config = getClaimBadgeStyle(status);
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", config.className, extraClass)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", config.dotClass)} />
      {config.label}
    </span>
  );
}

export function StepStatusBadge({ status }: { status: StepStatus }) {
  const config = stepStatusConfig[status];
  const labels: Record<StepStatus, string> = {
    pending: "Pending",
    "in-progress": "In Progress",
    completed: "Completed",
    failed: "Failed",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium", config.className)}>
      {labels[status]}
    </span>
  );
}
