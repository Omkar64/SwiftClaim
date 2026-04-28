// Re-export types from the new state machine module for backward compatibility
export type { ClaimState as ClaimStatus, ClaimStep as AgentStep } from "@/lib/claimStateMachine";
export { CLAIM_STATES, STATE_LABELS, STATE_AGENTS, STATE_DESCRIPTIONS, buildInitialSteps as agentWorkflowSteps } from "@/lib/claimStateMachine";

// Legacy agentWorkflow for the Index page display
export const agentWorkflow = [
  { id: "1", name: "Claim Intake", agent: "Claim Intake Agent", description: "Collects inputs, validates damage photo, creates claim record" },
  { id: "2", name: "Eligibility Check", agent: "Eligibility Verification Agent", description: "Validates policy, coverage type, and claim limits" },
  { id: "3", name: "Damage Assessment", agent: "Damage Assessment Agent", description: "AI-powered damage analysis and part identification" },
  { id: "4", name: "Garage Assignment", agent: "Garage Assignment Agent", description: "Assigns nearest authorized cashless garage" },
  { id: "5", name: "Surveyor Inspection", agent: "Surveyor Agent", description: "Identifies required parts and queries inventory" },
  { id: "6", name: "Inventory Check", agent: "Inventory Agent", description: "Confirms availability and reserves spare parts" },
  { id: "7", name: "Logistics & Delivery", agent: "Logistics Agent", description: "Coordinates dispatch and delivery to garage" },
  { id: "8", name: "Repair Phase", agent: "Garage", description: "Vehicle repair at assigned service center" },
  { id: "9", name: "Billing & Invoice", agent: "Billing Agent", description: "Generates insurance and customer invoices" },
  { id: "10", name: "Payment & Gate Pass", agent: "Accounts Agent", description: "Verifies payment and issues gate pass" },
];

export function generateClaimId(): string {
  const num = Math.floor(Math.random() * 99999).toString().padStart(5, "0");
  return `CLM-2026-${num}`;
}
