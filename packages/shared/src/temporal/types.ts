import type { ArtifactType, RunType, SkuType } from "../enums.js";

export type DealIntakeWorkflowInput = {
  orgId: string;
  dealId: string;
  runId: string;
};

export type JurisdictionRefreshWorkflowInput = {
  orgId: string;
  jurisdictionId: string;
  sku: SkuType;
  runId: string;
};

export type ArtifactGenerationWorkflowInput = {
  orgId: string;
  dealId: string;
  runIdsByArtifactType: Record<ArtifactType, string | undefined>;
  artifactTypes: ArtifactType[];
};

export type ChangeDetectionWorkflowInput = {
  orgId: string;
  jurisdictionId: string;
  runId: string;
};

export type BuyerPresellWorkflowInput = {
  orgId: string;
  dealId: string;
  runId: string;
};

export type RunRecordCreateInput = {
  orgId: string;
  runType: RunType;
  dealId?: string;
  jurisdictionId?: string;
  sku?: SkuType;
  status?: "running" | "succeeded" | "failed" | "canceled";
  inputHash?: string;
};

