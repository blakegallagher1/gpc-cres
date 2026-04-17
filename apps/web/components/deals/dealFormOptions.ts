import {
  DEAL_ASSET_CLASSES,
  DEAL_STRATEGIES,
  SKU_TYPES,
  WORKFLOW_TEMPLATE_KEYS,
  type DealAssetClass,
  type DealStrategy,
  type SkuType,
  type WorkflowTemplateKey,
} from "@entitlement-os/shared/enums";

type Option<Value extends string> = {
  value: Value;
  label: string;
};

const LABEL_OVERRIDES: Record<string, string> = {
  SMALL_BAY_FLEX: "Small Bay Flex",
  OUTDOOR_STORAGE: "Outdoor Storage",
  TRUCK_PARKING: "Truck Parking",
  MIXED_USE: "Mixed Use",
  SELF_STORAGE: "Self Storage",
  GROUND_UP_DEVELOPMENT: "Ground Up Development",
  VALUE_ADD_ACQUISITION: "Value Add Acquisition",
  CORE_ACQUISITION: "Core Acquisition",
  ASSET_MANAGEMENT: "Asset Management",
  DEBT_PLACEMENT: "Debt Placement",
  ENTITLEMENT_LAND: "Entitlement Land",
  PORTFOLIO_REVIEW: "Portfolio Review",
};

function formatLabel(value: string): string {
  return LABEL_OVERRIDES[value] ??
    value
      .toLowerCase()
      .split("_")
      .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
      .join(" ");
}

function toOptions<Value extends string>(values: readonly Value[]): Option<Value>[] {
  return values.map((value) => ({
    value,
    label: formatLabel(value),
  }));
}

export const SKU_OPTIONS = toOptions(SKU_TYPES satisfies readonly SkuType[]);
export const DEAL_ASSET_CLASS_OPTIONS = toOptions(
  DEAL_ASSET_CLASSES satisfies readonly DealAssetClass[],
);
export const DEAL_STRATEGY_OPTIONS = toOptions(
  DEAL_STRATEGIES satisfies readonly DealStrategy[],
);
export const WORKFLOW_TEMPLATE_OPTIONS = toOptions(
  WORKFLOW_TEMPLATE_KEYS satisfies readonly WorkflowTemplateKey[],
);

export const ENTITLEMENT_FORM_DEFAULTS = {
  assetClass: "INDUSTRIAL" as DealAssetClass,
  strategy: "ENTITLEMENT" as DealStrategy,
  workflowTemplateKey: "ENTITLEMENT_LAND" as WorkflowTemplateKey,
};

const DEFAULT_TEMPLATE_BY_STRATEGY: Partial<Record<DealStrategy, WorkflowTemplateKey>> = {
  ENTITLEMENT: "ENTITLEMENT_LAND",
  GROUND_UP_DEVELOPMENT: "DEVELOPMENT",
  VALUE_ADD_ACQUISITION: "ACQUISITION",
  CORE_ACQUISITION: "ACQUISITION",
  LEASE_UP: "LEASE_UP",
  ASSET_MANAGEMENT: "ASSET_MANAGEMENT",
  DISPOSITION: "DISPOSITION",
  RECAPITALIZATION: "REFINANCE",
  REFINANCE: "REFINANCE",
  DEBT_PLACEMENT: "REFINANCE",
};

export function resolveWorkflowTemplateDefault(
  strategy: DealStrategy,
): WorkflowTemplateKey | null {
  return DEFAULT_TEMPLATE_BY_STRATEGY[strategy] ?? null;
}
