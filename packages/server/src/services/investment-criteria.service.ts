import { prisma } from "@entitlement-os/db";
import {
  getDefaultInvestmentCriteria,
  type InvestmentCriteria,
} from "../deals/deal-fit-score.service";

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const num = typeof value === "number" ? value : Number(value);
  return Number.isFinite(num) ? num : null;
}

/**
 * Loads org-scoped investment criteria. Falls back to the shared defaults
 * for any field the org has not overridden.
 */
export async function loadInvestmentCriteria(orgId: string): Promise<InvestmentCriteria> {
  const defaults = getDefaultInvestmentCriteria();
  const row = await prisma.orgInvestmentCriteria.findUnique({
    where: { orgId },
  });
  if (!row) return defaults;

  return {
    minIrrPct: toNumberOrNull(row.minIrrPct) ?? defaults.minIrrPct,
    maxLtvPct: toNumberOrNull(row.maxLtvPct) ?? defaults.maxLtvPct,
    minDscr: toNumberOrNull(row.minDscr) ?? defaults.minDscr,
    preferredAssetClasses:
      row.preferredAssetClasses.length > 0
        ? row.preferredAssetClasses
        : defaults.preferredAssetClasses,
    preferredStrategies:
      row.preferredStrategies.length > 0
        ? row.preferredStrategies
        : defaults.preferredStrategies,
    preferredStates:
      row.preferredStates.length > 0 ? row.preferredStates : defaults.preferredStates,
    minAcreage: toNumberOrNull(row.minAcreage) ?? defaults.minAcreage,
    maxAcreage: toNumberOrNull(row.maxAcreage) ?? defaults.maxAcreage,
  };
}

export interface UpdateInvestmentCriteriaInput {
  orgId: string;
  userId: string;
  minIrrPct?: number | null;
  maxLtvPct?: number | null;
  minDscr?: number | null;
  preferredAssetClasses?: string[];
  preferredStrategies?: string[];
  preferredStates?: string[];
  minAcreage?: number | null;
  maxAcreage?: number | null;
}

export async function updateInvestmentCriteria(
  input: UpdateInvestmentCriteriaInput,
): Promise<InvestmentCriteria> {
  await prisma.orgInvestmentCriteria.upsert({
    where: { orgId: input.orgId },
    create: {
      orgId: input.orgId,
      minIrrPct: input.minIrrPct ?? null,
      maxLtvPct: input.maxLtvPct ?? null,
      minDscr: input.minDscr ?? null,
      preferredAssetClasses: input.preferredAssetClasses ?? [],
      preferredStrategies: input.preferredStrategies ?? [],
      preferredStates: input.preferredStates ?? [],
      minAcreage: input.minAcreage ?? null,
      maxAcreage: input.maxAcreage ?? null,
      updatedBy: input.userId,
    },
    update: {
      ...(input.minIrrPct !== undefined ? { minIrrPct: input.minIrrPct } : {}),
      ...(input.maxLtvPct !== undefined ? { maxLtvPct: input.maxLtvPct } : {}),
      ...(input.minDscr !== undefined ? { minDscr: input.minDscr } : {}),
      ...(input.preferredAssetClasses !== undefined
        ? { preferredAssetClasses: input.preferredAssetClasses }
        : {}),
      ...(input.preferredStrategies !== undefined
        ? { preferredStrategies: input.preferredStrategies }
        : {}),
      ...(input.preferredStates !== undefined
        ? { preferredStates: input.preferredStates }
        : {}),
      ...(input.minAcreage !== undefined ? { minAcreage: input.minAcreage } : {}),
      ...(input.maxAcreage !== undefined ? { maxAcreage: input.maxAcreage } : {}),
      updatedBy: input.userId,
    },
  });
  return loadInvestmentCriteria(input.orgId);
}
