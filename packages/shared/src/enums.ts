export const SKU_TYPES = ["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"] as const;
export type SkuType = (typeof SKU_TYPES)[number];

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
] as const;
export type DealStatus = (typeof DEAL_STATUSES)[number];

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const ARTIFACT_TYPES = [
  "TRIAGE_PDF",
  "SUBMISSION_CHECKLIST_PDF",
  "HEARING_DECK_PPTX",
  "EXIT_PACKAGE_PDF",
  "BUYER_TEASER_PDF",
] as const;
export type ArtifactType = (typeof ARTIFACT_TYPES)[number];

export const EVIDENCE_TYPES = ["WEB_PAGE", "PDF", "IMAGE", "TEXT_EXTRACT"] as const;
export type EvidenceType = (typeof EVIDENCE_TYPES)[number];

export const RUN_TYPES = [
  "TRIAGE",
  "PARISH_PACK_REFRESH",
  "ARTIFACT_GEN",
  "BUYER_LIST_BUILD",
  "CHANGE_DETECT",
] as const;
export type RunType = (typeof RUN_TYPES)[number];

export const WORKFLOW_PATH_TYPES = ["CUP", "REZONING", "VARIANCE", "PUD", "UNKNOWN"] as const;
export type WorkflowPathType = (typeof WORKFLOW_PATH_TYPES)[number];

