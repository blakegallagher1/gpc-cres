import type {
  DealAssetClass,
  DealStageKey,
  DealStatus,
  DealStrategy,
  SkuType,
  WorkflowTemplateKey,
} from "@entitlement-os/shared";

const LEGACY_SKU_GENERALIZATION_MAP: Record<
  SkuType,
  {
    assetClass: DealAssetClass;
    strategy: DealStrategy;
    workflowTemplateKey: WorkflowTemplateKey;
  }
> = {
  SMALL_BAY_FLEX: {
    assetClass: "INDUSTRIAL",
    strategy: "ENTITLEMENT",
    workflowTemplateKey: "ENTITLEMENT_LAND",
  },
  OUTDOOR_STORAGE: {
    assetClass: "INDUSTRIAL",
    strategy: "ENTITLEMENT",
    workflowTemplateKey: "ENTITLEMENT_LAND",
  },
  TRUCK_PARKING: {
    assetClass: "INDUSTRIAL",
    strategy: "ENTITLEMENT",
    workflowTemplateKey: "ENTITLEMENT_LAND",
  },
};

const LEGACY_STATUS_STAGE_MAP: Record<DealStatus, DealStageKey> = {
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

const STAGE_COMPATIBILITY_STATUS_PRIORITY: Record<DealStageKey, DealStatus[]> = {
  ORIGINATION: ["INTAKE"],
  SCREENING: ["TRIAGE_DONE"],
  UNDERWRITING: ["PREAPP", "CONCEPT"],
  DUE_DILIGENCE: ["NEIGHBORS"],
  CONTRACTING: ["SUBMITTED"],
  EXECUTION: ["SUBMITTED", "HEARING", "APPROVED"],
  ASSET_MANAGEMENT: ["APPROVED"],
  DISPOSITION: ["EXIT_MARKETED"],
  CLOSED_WON: ["EXITED"],
  CLOSED_LOST: ["KILLED"],
};

const DEFAULT_COMPATIBILITY_SKU: SkuType = "SMALL_BAY_FLEX";

export type CanonicalDealWorkflowState = {
  assetClass: DealAssetClass | null;
  strategy: DealStrategy | null;
  workflowTemplateKey: WorkflowTemplateKey | null;
  currentStageKey: DealStageKey | null;
};

export function hasOwn(body: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, key);
}

export function resolveGeneralizedFieldsFromLegacySku(sku: SkuType | null | undefined): {
  assetClass: DealAssetClass | null;
  strategy: DealStrategy | null;
  workflowTemplateKey: WorkflowTemplateKey | null;
} {
  if (!sku) {
    return {
      assetClass: null,
      strategy: null,
      workflowTemplateKey: null,
    };
  }

  return LEGACY_SKU_GENERALIZATION_MAP[sku];
}

export function resolveStageKeyFromLegacyStatus(
  status: DealStatus | null | undefined,
): DealStageKey | null {
  if (!status) {
    return null;
  }

  return LEGACY_STATUS_STAGE_MAP[status];
}

function isLegacySkuCompatible(
  sku: SkuType,
  workflowState: CanonicalDealWorkflowState,
): boolean {
  const generalized = resolveGeneralizedFieldsFromLegacySku(sku);

  if (
    workflowState.assetClass !== null &&
    generalized.assetClass !== workflowState.assetClass
  ) {
    return false;
  }

  if (
    workflowState.strategy !== null &&
    generalized.strategy !== workflowState.strategy
  ) {
    return false;
  }

  if (
    workflowState.workflowTemplateKey !== null &&
    generalized.workflowTemplateKey !== workflowState.workflowTemplateKey
  ) {
    return false;
  }

  return true;
}

function resolveLegacySkuFromWorkflowState(
  workflowState: CanonicalDealWorkflowState,
  legacySkuHint: SkuType | null | undefined,
): SkuType {
  if (legacySkuHint && isLegacySkuCompatible(legacySkuHint, workflowState)) {
    return legacySkuHint;
  }

  return DEFAULT_COMPATIBILITY_SKU;
}

export function resolveLegacyStatusFromStageKey(
  stageKey: DealStageKey | null | undefined,
  legacyStatusHint: DealStatus | null | undefined,
): DealStatus {
  if (!stageKey) {
    return legacyStatusHint ?? "INTAKE";
  }

  const candidates = STAGE_COMPATIBILITY_STATUS_PRIORITY[stageKey];
  if (legacyStatusHint && candidates.includes(legacyStatusHint)) {
    return legacyStatusHint;
  }

  return candidates[0];
}

export function resolveCanonicalDealWorkflowState({
  base = {},
  overrides = {},
  legacySku,
  legacyStatus,
}: {
  base?: Partial<CanonicalDealWorkflowState>;
  overrides?: Partial<CanonicalDealWorkflowState>;
  legacySku?: SkuType | null;
  legacyStatus?: DealStatus | null;
}): CanonicalDealWorkflowState {
  const legacyFields = resolveGeneralizedFieldsFromLegacySku(legacySku);

  return {
    assetClass:
      overrides.assetClass ?? base.assetClass ?? legacyFields.assetClass,
    strategy: overrides.strategy ?? base.strategy ?? legacyFields.strategy,
    workflowTemplateKey:
      overrides.workflowTemplateKey ??
      base.workflowTemplateKey ??
      legacyFields.workflowTemplateKey,
    currentStageKey:
      overrides.currentStageKey ??
      base.currentStageKey ??
      resolveStageKeyFromLegacyStatus(legacyStatus),
  };
}

export function projectLegacyDealCompatibility({
  workflowState,
  legacySkuHint,
  legacyStatusHint,
}: {
  workflowState: CanonicalDealWorkflowState;
  legacySkuHint?: SkuType | null;
  legacyStatusHint?: DealStatus | null;
}): {
  sku: SkuType;
  status: DealStatus;
  legacySku: SkuType;
  legacyStatus: DealStatus;
} {
  const sku = resolveLegacySkuFromWorkflowState(workflowState, legacySkuHint);
  const status = resolveLegacyStatusFromStageKey(
    workflowState.currentStageKey,
    legacyStatusHint,
  );

  return {
    sku,
    status,
    legacySku: sku,
    legacyStatus: status,
  };
}

export function toDateOrNull(value: string | null | undefined): Date | null {
  if (!value) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}
