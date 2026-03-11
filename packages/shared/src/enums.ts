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

export const DEAL_ASSET_CLASSES = [
  "LAND",
  "INDUSTRIAL",
  "OFFICE",
  "RETAIL",
  "MULTIFAMILY",
  "SELF_STORAGE",
  "HOSPITALITY",
  "MIXED_USE",
  "SPECIALTY",
  "PORTFOLIO",
] as const;
export type DealAssetClass = (typeof DEAL_ASSET_CLASSES)[number];

export const DEAL_STRATEGIES = [
  "ENTITLEMENT",
  "GROUND_UP_DEVELOPMENT",
  "VALUE_ADD_ACQUISITION",
  "CORE_ACQUISITION",
  "LEASE_UP",
  "ASSET_MANAGEMENT",
  "RECAPITALIZATION",
  "REFINANCE",
  "DISPOSITION",
  "DEBT_PLACEMENT",
] as const;
export type DealStrategy = (typeof DEAL_STRATEGIES)[number];

export const WORKFLOW_TEMPLATE_KEYS = [
  "ENTITLEMENT_LAND",
  "DEVELOPMENT",
  "ACQUISITION",
  "LEASE_UP",
  "ASSET_MANAGEMENT",
  "DISPOSITION",
  "REFINANCE",
  "PORTFOLIO_REVIEW",
] as const;
export type WorkflowTemplateKey = (typeof WORKFLOW_TEMPLATE_KEYS)[number];

export const DEAL_STAGE_KEYS = [
  "ORIGINATION",
  "SCREENING",
  "UNDERWRITING",
  "DUE_DILIGENCE",
  "CONTRACTING",
  "EXECUTION",
  "ASSET_MANAGEMENT",
  "DISPOSITION",
  "CLOSED_WON",
  "CLOSED_LOST",
] as const;
export type DealStageKey = (typeof DEAL_STAGE_KEYS)[number];

export const OPPORTUNITY_KINDS = ["SITE", "PROPERTY", "LOAN", "PORTFOLIO", "TENANT", "JV"] as const;
export type OpportunityKind = (typeof OPPORTUNITY_KINDS)[number];

export const DEAL_SOURCE_TYPES = [
  "MANUAL",
  "BROKER",
  "OWNER_DIRECT",
  "MARKET_SCAN",
  "AGENT_DISCOVERY",
  "REFERRAL",
  "IMPORT",
] as const;
export type DealSourceType = (typeof DEAL_SOURCE_TYPES)[number];

export const DEAL_ASSET_ROLES = ["PRIMARY", "COMPARABLE", "ADJACENT"] as const;
export type DealAssetRole = (typeof DEAL_ASSET_ROLES)[number];

export const TASK_STATUSES = ["TODO", "IN_PROGRESS", "BLOCKED", "DONE", "CANCELED"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const ARTIFACT_TYPES = [
  "TRIAGE_PDF",
  "SUBMISSION_CHECKLIST_PDF",
  "HEARING_DECK_PPTX",
  "EXIT_PACKAGE_PDF",
  "BUYER_TEASER_PDF",
  "INVESTMENT_MEMO_PDF",
  "OFFERING_MEMO_PDF",
  "COMP_ANALYSIS_PDF",
  "IC_DECK_PPTX",
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
  "SOURCE_INGEST",
  "ENRICHMENT",
  "INTAKE_PARSE",
  "DOCUMENT_CLASSIFY",
  "BUYER_OUTREACH_DRAFT",
  "ADVANCEMENT_CHECK",
] as const;
export type RunType = (typeof RUN_TYPES)[number];

export const WORKFLOW_PATH_TYPES = ["CUP", "REZONING", "VARIANCE", "PUD", "UNKNOWN"] as const;
export type WorkflowPathType = (typeof WORKFLOW_PATH_TYPES)[number];
