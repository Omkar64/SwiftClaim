import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CLAIM_STATES, type ClaimState } from "@/lib/claimStateMachine";

/**
 * Default estimated processing durations in seconds per state.
 * Used as fallback when insufficient historical data exists.
 * Values are tuned to typical AI agent processing times.
 */
export const DEFAULT_DURATIONS_S: Record<ClaimState, number> = {
  REGISTERED:           18,
  ELIGIBILITY_VERIFIED: 22,
  DAMAGE_ASSESSED:      28,
  GARAGE_ASSIGNED:      15,
  SURVEY_COMPLETED:     22,
  INVENTORY_CONFIRMED:  18,
  PARTS_DISPATCHED:     15,
  PARTS_DELIVERED:      15,
  REPAIR_COMPLETED:     18,
  BILL_GENERATED:       24,
  PAYMENT_CONFIRMED:    12,
  GATE_PASS_ISSUED:     10,
  CLAIM_CLOSED:          8,
};

const MIN_SAMPLES = 3; // require at least this many historical data points

export interface AgentETA {
  /** Average processing duration per state in seconds */
  averages: Record<ClaimState, number>;
  /** Number of historical samples per state */
  sampleCounts: Partial<Record<ClaimState, number>>;
  /** Whether averages have been computed from real data */
  hasRealData: boolean;
}

export function useAgentETA(): AgentETA {
  const [result, setResult] = useState<AgentETA>({
    averages: { ...DEFAULT_DURATIONS_S },
    sampleCounts: {},
    hasRealData: false,
  });

  useEffect(() => {
    const compute = async () => {
      const { data } = await supabase
        .from("claims" as any)
        .select("steps")
        .order("created_at", { ascending: false })
        .limit(100);

      if (!data || data.length === 0) return;

      // Accumulate duration samples: state → array of durations in seconds
      const durationMap: Partial<Record<ClaimState, number[]>> = {};
      const countMap: Partial<Record<ClaimState, number>> = {};

      for (const row of data) {
        const steps = (row as any).steps;
        if (!Array.isArray(steps) || steps.length < 2) continue;

        for (let i = 0; i < steps.length; i++) {
          const step = steps[i];
          if (step.status !== "completed") continue;
          const state = step.state as ClaimState;
          if (!CLAIM_STATES.includes(state)) continue;

          // Count samples regardless of whether we have ISO timestamps
          countMap[state] = (countMap[state] ?? 0) + 1;

          // Compute duration if both ISO timestamps exist
          const startedAt: string | null = step.started_at;
          const completedAt: string | null = step.completed_at;
          if (startedAt && completedAt) {
            const duration = (new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000;
            if (duration > 0 && duration < 300) { // sanity: between 0–5 min
              if (!durationMap[state]) durationMap[state] = [];
              durationMap[state]!.push(duration);
            }
          }
        }
      }

      // Build averages: use real data if enough samples, else keep default
      const averages = { ...DEFAULT_DURATIONS_S } as Record<ClaimState, number>;
      let anyRealData = false;
      for (const state of CLAIM_STATES) {
        const samples = durationMap[state];
        if (samples && samples.length >= MIN_SAMPLES) {
          averages[state] = Math.round(samples.reduce((a, b) => a + b, 0) / samples.length);
          anyRealData = true;
        }
      }

      setResult({ averages, sampleCounts: countMap, hasRealData: anyRealData });
    };

    compute();
  }, []);

  return result;
}
