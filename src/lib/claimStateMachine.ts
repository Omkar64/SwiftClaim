// Strict 13-state claim processing state machine

export const CLAIM_STATES = [
  "REGISTERED",
  "ELIGIBILITY_VERIFIED",
  "DAMAGE_ASSESSED",
  "GARAGE_ASSIGNED",
  "SURVEY_COMPLETED",
  "INVENTORY_CONFIRMED",
  "PARTS_DISPATCHED",
  "PARTS_DELIVERED",
  "REPAIR_COMPLETED",
  "BILL_GENERATED",
  "PAYMENT_CONFIRMED",
  "GATE_PASS_ISSUED",
  "CLAIM_CLOSED",
] as const;

export type ClaimState = (typeof CLAIM_STATES)[number];

export const STATE_LABELS: Record<ClaimState, string> = {
  REGISTERED: "Registered",
  ELIGIBILITY_VERIFIED: "Eligibility Verified",
  DAMAGE_ASSESSED: "Damage Assessed",
  GARAGE_ASSIGNED: "Garage Assigned",
  SURVEY_COMPLETED: "Survey Completed",
  INVENTORY_CONFIRMED: "Inventory Confirmed",
  PARTS_DISPATCHED: "Parts Dispatched",
  PARTS_DELIVERED: "Parts Delivered",
  REPAIR_COMPLETED: "Repair Completed",
  BILL_GENERATED: "Bill Generated",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  GATE_PASS_ISSUED: "Gate Pass Issued",
  CLAIM_CLOSED: "Claim Closed",
};

export const STATE_AGENTS: Record<ClaimState, string> = {
  REGISTERED: "Claim Intake Agent",
  ELIGIBILITY_VERIFIED: "Eligibility Verification Agent",
  DAMAGE_ASSESSED: "Damage Assessment Agent",
  GARAGE_ASSIGNED: "Garage Assignment Agent",
  SURVEY_COMPLETED: "Surveyor Agent",
  INVENTORY_CONFIRMED: "Inventory Agent",
  PARTS_DISPATCHED: "Logistics Agent",
  PARTS_DELIVERED: "Logistics Agent",
  REPAIR_COMPLETED: "Repair Tracking",
  BILL_GENERATED: "Billing Agent",
  PAYMENT_CONFIRMED: "Accounts Agent",
  GATE_PASS_ISSUED: "Accounts Agent",
  CLAIM_CLOSED: "System",
};

export const STATE_DESCRIPTIONS: Record<ClaimState, string> = {
  REGISTERED: "Claim registered with validated inputs and damage photo",
  ELIGIBILITY_VERIFIED: "Policy coverage and eligibility confirmed",
  DAMAGE_ASSESSED: "Damage severity and required parts identified",
  GARAGE_ASSIGNED: "Nearest authorized garage assigned",
  SURVEY_COMPLETED: "Spare parts classified and inventory queried",
  INVENTORY_CONFIRMED: "Spare parts availability confirmed and reserved",
  PARTS_DISPATCHED: "Parts dispatched from suppliers to garage",
  PARTS_DELIVERED: "All parts delivered to the assigned garage",
  REPAIR_COMPLETED: "Vehicle repair completed at garage",
  BILL_GENERATED: "Insurance and customer invoices generated",
  PAYMENT_CONFIRMED: "Both insurance and customer payments verified",
  GATE_PASS_ISSUED: "Gate pass generated for vehicle release",
  CLAIM_CLOSED: "Claim processing complete",
};

export type StepStatus = "completed" | "in-progress" | "pending" | "failed";

export interface ClaimStep {
  id: string;
  state: ClaimState;
  label: string;
  agent: string;
  description: string;
  status: StepStatus;
  details?: string;
  timestamp?: string;
  ai_processed?: boolean;
}

export function getStateIndex(state: ClaimState): number {
  return CLAIM_STATES.indexOf(state);
}

export function isValidTransition(current: ClaimState, next: ClaimState): boolean {
  const currentIdx = getStateIndex(current);
  const nextIdx = getStateIndex(next);
  return nextIdx === currentIdx + 1;
}

export function buildInitialSteps(): ClaimStep[] {
  return CLAIM_STATES.map((state, i) => ({
    id: String(i + 1),
    state,
    label: STATE_LABELS[state],
    agent: STATE_AGENTS[state],
    description: STATE_DESCRIPTIONS[state],
    status: "pending" as StepStatus,
  }));
}

export function getStepStatusColor(status: StepStatus) {
  switch (status) {
    case "completed": return "status-success";
    case "in-progress": return "status-info";
    case "failed": return "destructive";
    default: return "muted-foreground";
  }
}

export function getClaimProgress(status: string): number {
  const idx = CLAIM_STATES.indexOf(status as ClaimState);
  if (idx === -1) return 0;
  return Math.round(((idx + 1) / CLAIM_STATES.length) * 100);
}
