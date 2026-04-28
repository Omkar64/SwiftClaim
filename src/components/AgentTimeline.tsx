import { useState, useEffect, useRef } from "react";
import { Check, Clock, Loader2, AlertCircle, Sparkles, AlertTriangle, RotateCcw, Timer } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClaimStep, StepStatus, ClaimState } from "@/lib/claimStateMachine";
import { CLAIM_STATES } from "@/lib/claimStateMachine";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { DEFAULT_DURATIONS_S } from "@/hooks/useAgentETA";

const statusIcons: Record<StepStatus, typeof Check> = {
  completed: Check,
  "in-progress": Loader2,
  pending: Clock,
  failed: AlertCircle,
};

interface AgentTimelineProps {
  steps: ClaimStep[];
  isAdmin?: boolean;
  onRetryStep?: (stepIndex: number) => Promise<void>;
  /** Average processing durations per state in seconds (from useAgentETA) */
  averageDurations?: Partial<Record<ClaimState, number>>;
}

// ── ETA Countdown ────────────────────────────────────────────────────────────
interface ETACountdownProps {
  startedAt: string;        // ISO timestamp
  avgDurationS: number;     // expected duration in seconds
  sampleCount?: number;     // how many historical claims informed this estimate
}

function ETACountdown({ startedAt, avgDurationS, sampleCount }: ETACountdownProps) {
  const [remaining, setRemaining] = useState<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const tick = () => {
      const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
      setRemaining(Math.max(0, avgDurationS - elapsed));
    };
    tick();
    intervalRef.current = setInterval(tick, 500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [startedAt, avgDurationS]);

  if (remaining === null) return null;

  const elapsed = (Date.now() - new Date(startedAt).getTime()) / 1000;
  const progress = Math.min(1, elapsed / avgDurationS);
  const isOverdue = remaining === 0;

  const formatTime = (s: number) => {
    if (s < 1) return "< 1s";
    if (s < 60) return `${Math.ceil(s)}s`;
    return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
  };

  return (
    <div className="mt-2 space-y-1.5">
      {/* Progress bar */}
      <div className="h-1 w-full rounded-full bg-status-info/15 overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isOverdue ? "bg-status-warning animate-pulse" : "bg-status-info"
          )}
          style={{ width: `${progress * 100}%` }}
        />
      </div>

      {/* Label row */}
      <div className="flex items-center justify-between gap-2">
        <span className={cn(
          "inline-flex items-center gap-1 text-[10px] font-medium",
          isOverdue ? "text-status-warning" : "text-status-info"
        )}>
          <Timer className="h-3 w-3" />
          {isOverdue ? "Taking longer than usual…" : `~${formatTime(remaining)} remaining`}
        </span>

        {/* Confidence tooltip */}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="text-[10px] text-muted-foreground cursor-default select-none">
              {sampleCount && sampleCount >= 3
                ? `avg of ${sampleCount} claims`
                : "estimated"}
            </span>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs max-w-48">
            {sampleCount && sampleCount >= 3
              ? `Based on ${sampleCount} historical claims for this step. Average: ~${Math.round(avgDurationS)}s.`
              : `Default estimate (~${Math.round(avgDurationS)}s). Will improve with more processed claims.`}
          </TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export function AgentTimeline({ steps, isAdmin = false, onRetryStep, averageDurations }: AgentTimelineProps) {
  const [retryingIndex, setRetryingIndex] = useState<number | null>(null);

  const handleRetry = async (step: ClaimStep, index: number) => {
    if (!onRetryStep) return;
    const stepIndex = CLAIM_STATES.indexOf(step.state);
    if (stepIndex === -1) return;
    setRetryingIndex(index);
    try {
      await onRetryStep(stepIndex);
    } finally {
      setRetryingIndex(null);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-0">
        {steps.map((step, index) => {
          const Icon = statusIcons[step.status];
          const isLast = index === steps.length - 1;
          const isCompleted = step.status === "completed";
          const isInProgress = step.status === "in-progress";
          const isFailed = step.status === "failed";
          const showAiBadge = isCompleted && step.ai_processed === true;
          const showFallbackBadge = isCompleted && step.ai_processed === false && !!step.details;
          const showRetry = isAdmin && onRetryStep && (isFailed || showFallbackBadge);
          const isRetrying = retryingIndex === index;

          // ETA: show on in-progress steps when we have a started_at ISO timestamp
          const startedAt = (step as any).started_at as string | undefined;
          const avgDuration = averageDurations?.[step.state] ?? DEFAULT_DURATIONS_S[step.state];
          const showETA = isInProgress && !!startedAt;

          return (
            <div key={step.id} className="flex gap-4" style={{ animationDelay: `${index * 80}ms` }}>
              {/* Line + Icon */}
              <div className="flex flex-col items-center">
                <div className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 transition-all duration-500",
                  step.status === "completed" && "border-status-success bg-status-success/10",
                  step.status === "in-progress" && "border-status-info bg-status-info/10",
                  step.status === "pending" && "border-border bg-muted",
                  step.status === "failed" && "border-destructive bg-destructive/10",
                )}>
                  <Icon className={cn("h-4 w-4", {
                    "text-status-success": step.status === "completed",
                    "text-status-info animate-spin": step.status === "in-progress",
                    "text-muted-foreground": step.status === "pending",
                    "text-destructive": step.status === "failed",
                  })} />
                </div>
                {!isLast && (
                  <div className={cn("w-0.5 flex-1 min-h-[2rem] transition-colors duration-500", {
                    "bg-status-success": step.status === "completed",
                    "bg-border": step.status !== "completed",
                  })} />
                )}
              </div>

              {/* Content */}
              <div className={cn("pb-6 pt-1 flex-1", !isLast && "pb-6")}>
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className={cn("text-sm font-semibold", step.status === "pending" ? "text-muted-foreground" : "text-foreground")}>
                    {step.label}
                  </h4>
                  {step.timestamp && (
                    <span className="text-xs text-muted-foreground">{step.timestamp}</span>
                  )}

                  {/* AI processed badge */}
                  {showAiBadge && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary border border-primary/20 cursor-default">
                          <Sparkles className="h-2.5 w-2.5" />
                          AI
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Processed by AI agent
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Fallback badge */}
                  {showFallbackBadge && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground border border-border cursor-default">
                          <AlertTriangle className="h-2.5 w-2.5" />
                          Fallback
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        AI unavailable — system default used
                      </TooltipContent>
                    </Tooltip>
                  )}

                  {/* Retry button — admin only, failed or fallback steps */}
                  {showRetry && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                          disabled={isRetrying || retryingIndex !== null}
                          onClick={() => handleRetry(step, index)}
                        >
                          <RotateCcw className={cn("h-3 w-3", isRetrying && "animate-spin")} />
                          {isRetrying ? "Retrying…" : "Retry"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent side="top" className="text-xs">
                        Re-trigger this agent step without restarting the pipeline
                      </TooltipContent>
                    </Tooltip>
                  )}
                </div>

                <p className="text-xs text-muted-foreground mt-0.5">{step.agent}</p>

                {step.details && (
                  <p className={cn("text-sm mt-1", step.status === "in-progress" ? "text-status-info" : "text-foreground/70")}>
                    {step.details}
                  </p>
                )}

                {/* ── Live ETA countdown for in-progress step ── */}
                {showETA && (
                  <ETACountdown
                    startedAt={startedAt!}
                    avgDurationS={avgDuration}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>
    </TooltipProvider>
  );
}
