import type { DealStatus } from "@entitlement-os/shared";

export const DEAL_STATUSES = [
  "INTAKE",
  "TRIAGE_DONE",
  "PREAPP",
  "CONCEPT",
  "NEIGHBORS",
  "SUBMITTED",
  "HEARING",
  "APPROVED",
  "EXIT_MARKETED",
  "EXITED",
  "KILLED",
] as const satisfies readonly DealStatus[];

export const DEAL_BOARD_STAGES = [
  {
    key: "ORIGINATION",
    label: "Origination",
    compatibleStatuses: ["INTAKE"] as const,
  },
  {
    key: "SCREENING",
    label: "Screening",
    compatibleStatuses: ["TRIAGE_DONE"] as const,
  },
  {
    key: "UNDERWRITING",
    label: "Underwriting",
    compatibleStatuses: ["PREAPP", "CONCEPT"] as const,
  },
  {
    key: "DUE_DILIGENCE",
    label: "Due Diligence",
    compatibleStatuses: ["NEIGHBORS"] as const,
  },
  {
    key: "CONTRACTING",
    label: "Contracting",
    compatibleStatuses: ["SUBMITTED"] as const,
  },
  {
    key: "EXECUTION",
    label: "Execution",
    compatibleStatuses: ["SUBMITTED", "HEARING", "APPROVED"] as const,
  },
  {
    key: "DISPOSITION",
    label: "Disposition",
    compatibleStatuses: ["EXIT_MARKETED"] as const,
  },
  {
    key: "CLOSED_WON",
    label: "Closed Won",
    compatibleStatuses: ["EXITED"] as const,
  },
  {
    key: "CLOSED_LOST",
    label: "Closed Lost",
    compatibleStatuses: ["KILLED"] as const,
  },
] as const;

export type BoardStatus = DealStatus;
export type BoardStage = (typeof DEAL_BOARD_STAGES)[number];
export type DealStageKey = (typeof DEAL_BOARD_STAGES)[number]["key"];

const STATUS_TO_BOARD_STAGE: Record<DealStatus, DealStageKey> = {
  INTAKE: "ORIGINATION",
  TRIAGE_DONE: "SCREENING",
  PREAPP: "UNDERWRITING",
  CONCEPT: "UNDERWRITING",
  NEIGHBORS: "DUE_DILIGENCE",
  SUBMITTED: "EXECUTION",
  HEARING: "EXECUTION",
  APPROVED: "EXECUTION",
  EXIT_MARKETED: "DISPOSITION",
  EXITED: "CLOSED_WON",
  KILLED: "CLOSED_LOST",
};

export const STAGE_COMPATIBILITY_BY_KEY: Record<
  DealStageKey,
  ReadonlyArray<BoardStatus>
> = DEAL_BOARD_STAGES.reduce(
  (acc, stage) => {
    acc[stage.key] = stage.compatibleStatuses;
    return acc;
  },
  {} as Record<DealStageKey, ReadonlyArray<BoardStatus>>,
);

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  INTAKE: "Intake",
  TRIAGE_DONE: "Triage Done",
  PREAPP: "Pre-App",
  CONCEPT: "Concept",
  NEIGHBORS: "Neighbors",
  SUBMITTED: "Submitted",
  HEARING: "Hearing",
  APPROVED: "Approved",
  EXIT_MARKETED: "Exit Marketed",
  EXITED: "Exited",
  KILLED: "Killed",
};

export function resolveBoardStageFromStatus(status: string): DealStageKey | null {
  return STATUS_TO_BOARD_STAGE[status as DealStatus] ?? null;
}

export function getDefaultStatusForStage(key: DealStageKey): BoardStatus {
  const candidates = STAGE_COMPATIBILITY_BY_KEY[key];
  return candidates[0];
}
