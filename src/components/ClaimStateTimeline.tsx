import { cn } from "@/lib/utils";
import { CLAIM_STATES, STATE_LABELS, getStateIndex, type ClaimState } from "@/lib/claimStateMachine";
import { Check, Circle } from "lucide-react";

interface ClaimStateTimelineProps {
  currentState: string;
  className?: string;
}

export function ClaimStateTimeline({ currentState, className }: ClaimStateTimelineProps) {
  const currentIdx = getStateIndex(currentState as ClaimState);
  const isRejected = currentState === "rejected" || currentState === "FRAUD_SUSPECTED" || currentState === "NOT_ELIGIBLE";

  return (
    <div className={cn("space-y-0", className)}>
      {CLAIM_STATES.map((state, i) => {
        const isCompleted = !isRejected && i <= currentIdx;
        const isCurrent = !isRejected && i === currentIdx;
        const isLast = i === CLAIM_STATES.length - 1;

        return (
          <div key={state} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-bold transition-all",
                isCompleted
                  ? "border-status-success bg-status-success text-status-success-foreground"
                  : isRejected
                    ? "border-destructive bg-destructive/10 text-destructive"
                    : "border-border bg-muted text-muted-foreground",
                isCurrent && "ring-2 ring-status-info/30",
              )}>
                {isCompleted ? <Check className="h-3.5 w-3.5" /> : <Circle className="h-3 w-3" />}
              </div>
              {!isLast && (
                <div className={cn(
                  "w-0.5 flex-1 min-h-[1rem]",
                  isCompleted && i < currentIdx ? "bg-status-success" : "bg-border",
                )} />
              )}
            </div>
            <div className="pb-4 pt-0.5">
              <p className={cn(
                "text-xs font-medium",
                isCompleted ? "text-foreground" : "text-muted-foreground",
                isCurrent && "text-status-info font-semibold",
              )}>
                {STATE_LABELS[state]}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
