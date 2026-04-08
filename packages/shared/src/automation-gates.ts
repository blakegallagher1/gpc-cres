import type { DealStatus } from "./index.js";

const HUMAN_GATED_TRANSITIONS: ReadonlySet<string> = new Set([
  "TRIAGE_DONE→PREAPP",
  "PREAPP→CONCEPT",
  "CONCEPT→NEIGHBORS",
  "NEIGHBORS→SUBMITTED",
  "SUBMITTED→HEARING",
  "HEARING→APPROVED",
  "APPROVED→EXIT_MARKETED",
  "EXIT_MARKETED→EXITED",
]);

export function requiresHumanApproval(from: DealStatus, to: DealStatus): boolean {
  if (to === "KILLED") return false;
  return HUMAN_GATED_TRANSITIONS.has(`${from}→${to}`);
}

export function canAutoAdvance(from: DealStatus, to: DealStatus): boolean {
  return from === "INTAKE" && to === "TRIAGE_DONE";
}

export interface AdvancementCriteria {
  description: string;
  requiredTasksComplete: boolean;
  additionalChecks: string[];
}

const ADVANCEMENT_CRITERIA: Partial<Record<DealStatus, AdvancementCriteria>> = {
  TRIAGE_DONE: {
    description: "All Step 2 tasks DONE and triage decision is ADVANCE",
    requiredTasksComplete: true,
    additionalChecks: ["Triage decision must be ADVANCE (not KILL or HOLD)"],
  },
  PREAPP: {
    description: "Pre-app meeting notes uploaded and all Step 3 tasks DONE",
    requiredTasksComplete: true,
    additionalChecks: ["Pre-application meeting notes must be uploaded"],
  },
  CONCEPT: {
    description: "Concept plan uploaded and site plan approved",
    requiredTasksComplete: true,
    additionalChecks: ["Concept plan must be uploaded", "Site plan must be approved"],
  },
  NEIGHBORS: {
    description: "Neighbor notification complete with no unresolved objections",
    requiredTasksComplete: true,
    additionalChecks: ["Neighbor notification process must be complete", "No unresolved objections"],
  },
  SUBMITTED: {
    description: "Application submitted and hearing date set",
    requiredTasksComplete: true,
    additionalChecks: ["Application must be submitted to jurisdiction", "Hearing date must be set"],
  },
  HEARING: {
    description: "Hearing outcome is approved",
    requiredTasksComplete: true,
    additionalChecks: ["Hearing outcome must be 'approved'"],
  },
  APPROVED: {
    description: "Exit package generated and listed for sale",
    requiredTasksComplete: true,
    additionalChecks: ["Exit package artifact must exist", "Property must be listed for sale"],
  },
  EXIT_MARKETED: {
    description: "Closing date passed and funds received",
    requiredTasksComplete: true,
    additionalChecks: ["Closing date must have passed", "Funds must be received"],
  },
};

export function getAdvancementCriteria(stage: DealStatus): AdvancementCriteria | null {
  return ADVANCEMENT_CRITERIA[stage] ?? null;
}
