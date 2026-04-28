import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, ShieldX, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export interface FraudAnalysis {
  risk_level: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  confidence_score: number; // 0–100
  flags: string[];
  reasoning: string;
  analyzed_at: string;
  ai_processed: boolean;
}

interface FraudAnalysisPanelProps {
  analysis: FraudAnalysis;
}

const RISK_CONFIG = {
  LOW: {
    label: "Low Risk",
    color: "text-status-success",
    bg: "bg-status-success/8 border-status-success/25",
    badgeBg: "bg-status-success/15 text-status-success border-status-success/30",
    icon: ShieldCheck,
    bar: "bg-status-success",
  },
  MEDIUM: {
    label: "Medium Risk",
    color: "text-status-warning",
    bg: "bg-status-warning/8 border-status-warning/25",
    badgeBg: "bg-status-warning/15 text-status-warning border-status-warning/30",
    icon: ShieldAlert,
    bar: "bg-status-warning",
  },
  HIGH: {
    label: "High Risk",
    color: "text-destructive",
    bg: "bg-destructive/8 border-destructive/25",
    badgeBg: "bg-destructive/15 text-destructive border-destructive/30",
    icon: ShieldX,
    bar: "bg-destructive",
  },
  CRITICAL: {
    label: "Critical Risk",
    color: "text-destructive",
    bg: "bg-destructive/12 border-destructive/40",
    badgeBg: "bg-destructive text-destructive-foreground border-destructive",
    icon: ShieldX,
    bar: "bg-destructive",
  },
};

export function FraudAnalysisPanel({ analysis }: FraudAnalysisPanelProps) {
  const cfg = RISK_CONFIG[analysis.risk_level] ?? RISK_CONFIG.MEDIUM;
  const RiskIcon = cfg.icon;
  const score = Math.max(0, Math.min(100, analysis.confidence_score));

  // Score label based on fraud confidence (higher = more suspicious)
  const scoreLabel =
    score >= 75 ? "Very Likely Fraudulent" :
    score >= 50 ? "Possibly Fraudulent" :
    score >= 25 ? "Low Suspicion" :
    "Clean";

  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3 flex items-center gap-1.5">
        <ShieldAlert className="h-3.5 w-3.5 text-destructive" />
        Fraud Analysis
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="h-3 w-3 text-muted-foreground cursor-help ml-0.5" />
            </TooltipTrigger>
            <TooltipContent side="top" className="text-xs max-w-52">
              AI-generated fraud risk assessment. Visible to admins only. Not disclosed to claimants.
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </p>

      <div className={cn("rounded-lg border p-4 space-y-3", cfg.bg)}>
        {/* Risk header */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <RiskIcon className={cn("h-4 w-4 shrink-0", cfg.color)} />
            <span className={cn("text-sm font-bold", cfg.color)}>{cfg.label}</span>
          </div>
          <span className={cn("inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-bold", cfg.badgeBg)}>
            {analysis.risk_level}
          </span>
        </div>

        {/* Fraud confidence score bar */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">Fraud Confidence</span>
            <span className={cn("text-[10px] font-bold", cfg.color)}>{score}% — {scoreLabel}</span>
          </div>
          <div className="h-1.5 w-full rounded-full bg-muted/50 overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all duration-700", cfg.bar)}
              style={{ width: `${score}%` }}
            />
          </div>
        </div>

        {/* Flags */}
        {analysis.flags && analysis.flags.length > 0 && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">Detected Flags</p>
            <div className="space-y-1.5">
              {analysis.flags.map((flag, i) => (
                <div key={i} className="flex items-start gap-1.5 text-[10px]">
                  <AlertTriangle className="h-3 w-3 text-status-warning shrink-0 mt-0.5" />
                  <span className="text-foreground/80">{flag}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {analysis.flags && analysis.flags.length === 0 && (
          <div className="flex items-center gap-1.5 text-[10px] text-status-success">
            <CheckCircle2 className="h-3 w-3 shrink-0" />
            No suspicious flags detected
          </div>
        )}

        {/* AI Reasoning */}
        {analysis.reasoning && (
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1">AI Reasoning</p>
            <p className="text-[10px] text-muted-foreground/90 leading-relaxed">{analysis.reasoning}</p>
          </div>
        )}

        {/* Footer meta */}
        <div className="flex items-center justify-between pt-1 border-t border-border/40">
          <span className="text-[9px] text-muted-foreground">
            Analyzed: {new Date(analysis.analyzed_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
          </span>
          <span className={cn(
            "inline-flex items-center rounded-full px-1.5 py-0.5 text-[9px] font-semibold",
            analysis.ai_processed
              ? "bg-primary/10 text-primary"
              : "bg-muted text-muted-foreground"
          )}>
            {analysis.ai_processed ? "✨ AI" : "⚠ Fallback"}
          </span>
        </div>
      </div>
    </div>
  );
}
