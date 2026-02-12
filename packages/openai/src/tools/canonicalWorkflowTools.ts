import { type FunctionTool, tool } from "@openai/agents";
import { z } from "zod";
import { prisma } from "@entitlement-os/db";
import { ARTIFACT_TYPES, SKU_TYPES } from "@entitlement-os/shared";
import {
  calculate_debt_sizing,
  calculate_market_metrics,
  calculate_proforma,
  search_comparable_sales,
} from "./calculationTools.js";
import { parcelTriageScore } from "./scoringTools.js";

type ToolLike = {
  invoke: (
    runContext: Parameters<FunctionTool["invoke"]>[0],
    input: string,
    details?: Parameters<FunctionTool["invoke"]>[2],
  ) => Promise<unknown>;
};

type JSONValue = string | number | boolean | null | JSONArray | JSONObject;
type JSONArray = Array<JSONValue>;
type JSONObject = { [key: string]: JSONValue };

type ToolConfidence = {
  score: number;
  decision: "KILL" | "HOLD" | "ADVANCE";
  disqualifiers: Array<
    |
      string
      | {
          label?: unknown;
          detail?: unknown;
          severity?: unknown;
        }
  >;
  dataGaps: unknown[];
};

function safeParseJson(value: unknown): JSONObject | JSONArray | null {
  if (value == null) return null;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return parsed as JSONObject;
    } catch {
      return null;
    }
  }
  if (typeof value === "object") {
    return value as JSONObject | JSONArray;
  }
  return null;
}

function isJSONObject(value: unknown): value is JSONObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractComparableRows(
  payload: JSONObject | JSONArray | null,
): Array<JSONObject> {
  if (!payload) return [];
  if (Array.isArray(payload)) {
    return payload.filter(isJSONObject);
  }
  const raw = (payload as JSONObject).comparables;
  if (!Array.isArray(raw)) return [];
  return raw.filter(isJSONObject);
}

async function runTool(tool: ToolLike, input: Record<string, unknown>): Promise<string | null> {
  const runContext = null as unknown as Parameters<FunctionTool["invoke"]>[0];
  const output = await tool.invoke(runContext, JSON.stringify(input));
  if (output === undefined || output === null) return null;
  if (typeof output === "string") return output;
  return JSON.stringify(output);
}

function toNumber(value: unknown): number | null {
  if (value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (value instanceof Date) return value.getTime();
  const parsed = Number(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase();
    if (["true", "1", "yes", "y"].includes(trimmed)) return true;
    if (["false", "0", "no", "n"].includes(trimmed)) return false;
  }
  return null;
}

function parseRunDate(value: unknown): string | null {
  if (!(value instanceof Date)) return null;
  return value.toISOString();
}

function uniqueValues(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeArtifactType(value: string): (typeof ARTIFACT_TYPES)[number] | null {
  const normalized = value.trim().toUpperCase();
  return ARTIFACT_TYPES.includes(normalized as never)
    ? (normalized as (typeof ARTIFACT_TYPES)[number])
    : null;
}

function extractStorageObjectKey(downloadUrl: string): string | null {
  try {
    const parsed = new URL(downloadUrl);
    const path = parsed.pathname.replace(/^\/+/, "");
    return path || null;
  } catch {
    return null;
  }
}

export const get_jurisdiction_pack = tool({
  name: "get_jurisdiction_pack",
  description:
    "Retrieve the current jurisdiction pack. Optionally resolve one section and return structured lineage fields for confidence tracking.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    jurisdiction_id: z.string().uuid().describe("The jurisdiction to look up"),
    sku: z
      .enum(SKU_TYPES)
      .describe("The parcel use path to resolve the right pack version"),
    section: z
      .string()
      .nullable()
      .describe("Optional section key to extract from the pack JSON."),
  }),
  execute: async ({ orgId, jurisdiction_id, sku, section }) => {
    const pack = await prisma.parishPackVersion.findFirst({
      where: {
        orgId,
        jurisdictionId: jurisdiction_id,
        sku,
        status: "current",
      },
      orderBy: { version: "desc" },
    });

    if (!pack) {
      return JSON.stringify({
        error: "No current parish pack found",
        jurisdictionId: jurisdiction_id,
        sku,
      });
    }

    const packJson = pack.packJson as JSONObject;

    if (section) {
      if (Object.prototype.hasOwnProperty.call(packJson, section)) {
        return JSON.stringify({
          jurisdictionId: jurisdiction_id,
          sku,
          section,
          data: packJson[section],
          packVersionId: pack.id,
          version: pack.version,
          _meta: {
            generatedAt: pack.generatedAt.toISOString(),
            status: pack.status,
          },
        });
      }
      return JSON.stringify({
        error: `Section '${section}' not found`,
        jurisdictionId: jurisdiction_id,
        sku,
        availableSections: Object.keys(packJson),
        packVersionId: pack.id,
      });
    }

    return JSON.stringify({
      ...packJson,
      jurisdictionId: jurisdiction_id,
      sku,
      packVersionId: pack.id,
      version: pack.version,
      _meta: {
        generatedAt: pack.generatedAt.toISOString(),
        status: pack.status,
      },
    });
  },
});

export const create_tasks = tool({
  name: "create_tasks",
  description:
    "Create multiple tasks for a deal in one call with duplicate suppression.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    deal_id: z.string().uuid().describe("Deal that owns the tasks"),
    tasks: z
      .array(
        z.object({
          title: z.string().min(1).describe("Task title"),
          description: z.string().nullable().describe("Optional task details"),
          pipeline_step: z
            .number()
            .int()
            .min(1)
            .max(8)
            .describe("Pipeline step (1..8)"),
          due_at: z.string().nullable().describe("Due date (ISO 8601)"),
          owner_user_id: z
            .string()
            .uuid()
            .nullable()
            .describe("Task owner user id, optional"),
        }),
      )
      .min(1),
  }),
  execute: async ({ orgId, deal_id, tasks }) => {
    const deal = await prisma.deal.findFirst({
      where: { id: deal_id, orgId },
      select: { id: true },
    });
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }

    const dedupePayload = new Set<string>();
    const results = {
      requested: tasks.length,
      created: [] as Array<{ id: string; title: string; pipelineStep: number }>,
      skipped: [] as string[],
      createdCount: 0,
    };

    for (const task of tasks) {
      const payloadKey = `${task.title.toLowerCase()}::${task.pipeline_step}`;
      if (dedupePayload.has(payloadKey)) {
        results.skipped.push(`Duplicate task in request: ${task.title}`);
        continue;
      }
      dedupePayload.add(payloadKey);

      const existing = await prisma.task.findFirst({
        where: {
          orgId,
          dealId: deal_id,
          title: task.title,
          pipelineStep: task.pipeline_step,
        },
      });
      if (existing) {
        results.skipped.push(`Existing task already exists: ${task.title}`);
        continue;
      }

      const created = await prisma.task.create({
        data: {
          orgId,
          dealId: deal_id,
          title: task.title,
          description: task.description,
          pipelineStep: task.pipeline_step,
          dueAt: task.due_at ? new Date(task.due_at) : null,
          ownerUserId: task.owner_user_id,
        },
      });

      results.created.push({
        id: created.id,
        title: created.title,
        pipelineStep: created.pipelineStep,
      });
      results.createdCount += 1;
    }

    return JSON.stringify({
      ...results,
      status: "ok",
      dealId: deal_id,
    });
  },
});

export const attach_artifact = tool({
  name: "attach_artifact",
  description:
    "Attach a pre-generated artifact (storage key + metadata) to a deal. If generated_by_run_id is omitted, a completed artifact run is created.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    deal_id: z.string().uuid().describe("Deal ID the artifact belongs to"),
    artifact: z.object({
      artifact_type: z.enum(ARTIFACT_TYPES).describe("Artifact type"),
      storage_object_key: z
        .string()
        .nullable()
        .describe("Storage object key for the artifact file"),
      version: z
        .number()
        .int()
        .min(1)
        .nullable()
        .describe("Optional artifact version override"),
      download_url: z
        .string()
        .nullable()
        .describe("Optional download URL if storage key not provided"),
      generated_by_run_id: z
        .string()
        .uuid()
        .nullable()
        .describe("Optional existing run that produced this artifact"),
    }),
  }),
  execute: async ({ orgId, deal_id, artifact }) => {
    const deal = await prisma.deal.findFirst({
      where: { id: deal_id, orgId },
      select: { id: true },
    });
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }

    const artifactType = normalizeArtifactType(artifact.artifact_type);
    if (!artifactType) {
      return JSON.stringify({ error: `Invalid artifact type '${artifact.artifact_type}'` });
    }

    const storageObjectKey =
      artifact.storage_object_key ??
      (artifact.download_url ? extractStorageObjectKey(artifact.download_url) : null);
    if (!storageObjectKey) {
      return JSON.stringify({
        error: "storage_object_key or download_url must be provided",
      });
    }

    let generatedByRunId = artifact.generated_by_run_id ?? null;
    if (generatedByRunId) {
      const run = await prisma.run.findFirst({
        where: { id: generatedByRunId, orgId },
        select: { id: true },
      });
      if (!run) {
        return JSON.stringify({
          error: "generated_by_run_id does not exist in org scope",
        });
      }
    }

    if (!generatedByRunId) {
      const run = await prisma.run.create({
        data: {
          orgId,
          runType: "ARTIFACT_GEN",
          dealId: deal_id,
          status: "succeeded",
          startedAt: new Date(),
          finishedAt: new Date(),
        },
        select: { id: true },
      });
      generatedByRunId = run.id;
    }

    const nextVersion =
      artifact.version ??
      ((
        await prisma.artifact.findFirst({
          where: { orgId, dealId: deal_id, artifactType },
          orderBy: { version: "desc" },
          select: { version: true },
        })
      )?.version ?? 0) + 1;

    const existing = await prisma.artifact.findFirst({
      where: {
        orgId,
        dealId: deal_id,
        artifactType,
        version: nextVersion,
      },
      select: { id: true },
    });
    if (existing) {
      return JSON.stringify({
        status: "already_attached",
        artifactId: existing.id,
        artifactType,
        version: nextVersion,
      });
    }

    const created = await prisma.artifact.create({
      data: {
        orgId,
        dealId: deal_id,
        artifactType,
        version: nextVersion,
        storageObjectKey,
        generatedByRunId,
      },
    });

    return JSON.stringify({
      status: "attached",
      artifactId: created.id,
      artifactType,
      version: nextVersion,
      storageObjectKey,
      runId: generatedByRunId,
    });
  },
});

export const record_outcome = tool({
  name: "record_outcome",
  description:
    "Record terminal outcome and optional assumption actuals for one deal.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    created_by: z.string().uuid().describe("User creating this outcome record"),
    deal_id: z.string().uuid().describe("Deal to attach outcome to"),
    outcome: z
      .enum(["SUCCESS", "PARTIAL", "FAILURE"])
      .describe("Terminal deal outcome"),
    outcome_notes: z.string().nullable().describe("Notes describing outcome rationale"),
    projection_actuals: z
      .array(
        z.object({
          metric: z.string().min(1).describe("Assumption metric"),
          predicted: z.number().describe("Predicted value"),
          actual: z.number().nullable().describe("Actual outcome value"),
        }),
      )
      .nullable()
      .describe("Optional actuals for calibration"),
  }),
  execute: async ({ orgId, created_by, deal_id, outcome, outcome_notes, projection_actuals }) => {
    const deal = await prisma.deal.findFirst({
      where: { id: deal_id, orgId },
      select: { id: true },
    });
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }

    const outcomeLabelByResult: Record<(typeof outcome), { exitType: string | null; killReason: string | null }> = {
      SUCCESS: { exitType: "SALE", killReason: null },
      PARTIAL: { exitType: "SALE", killReason: null },
      FAILURE: { exitType: null, killReason: "Workflow marked as failure by agent." },
    };

    const outcomeRecord = await prisma.dealOutcome.upsert({
      where: { dealId: deal_id },
      create: {
        dealId: deal_id,
        createdBy: created_by,
        exitType: outcomeLabelByResult[outcome].exitType,
        killReason: outcomeLabelByResult[outcome].killReason,
        notes: outcome_notes,
      },
      update: {
        exitType: outcomeLabelByResult[outcome].exitType,
        killReason: outcomeLabelByResult[outcome].killReason,
        notes: outcome_notes,
      },
      select: { id: true },
    });

    const assumptionRows =
      projection_actuals?.filter((row) => row.actual !== null).map((row) => ({
        dealId: deal_id,
        assumptionName: row.metric,
        projectedValue: row.predicted,
        actualValue: row.actual,
        variancePct:
          row.actual === null
            ? null
            : row.predicted === 0
              ? null
              : ((row.actual - row.predicted) / Math.abs(row.predicted)) * 100,
      })) ?? [];

    if (assumptionRows.length > 0) {
      await prisma.$transaction(
        assumptionRows.map((row) =>
          prisma.assumptionActual.create({ data: row }),
        ),
      );
    }

    return JSON.stringify({
      status: "recorded",
      outcomeId: outcomeRecord.id,
      outcome,
      assumptionsStored: assumptionRows.length,
      dealId: deal_id,
    });
  },
});

export const triage_deal = tool({
  name: "triage_deal",
  description:
    "Run a quick triage across a deal's parcels and return score, disqualifiers, and evidence gaps.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    deal_id: z.string().uuid().describe("Deal to triage"),
    include_parcel_breakdown: z
      .boolean()
      .nullable()
      .describe("Whether to include per-parcel breakdown"),
  }),
  execute: async ({ orgId, deal_id, include_parcel_breakdown }) => {
    const deal = await prisma.deal.findFirst({
      where: { id: deal_id, orgId },
      include: { parcels: true },
    });
    if (!deal) {
      return JSON.stringify({ error: "Deal not found or access denied" });
    }
    if (deal.parcels.length === 0) {
      return JSON.stringify({
        dealId: deal_id,
        decision: "HOLD",
        score: 0,
        narrative: "No parcels are attached to this deal. Add parcels before triage.",
        disqualifiers: ["No parcels attached"],
        requiredEvidence: ["parcel geocoding", "parcel zoning", "parcel flood screening"],
        confidence: 0.2,
      });
    }

    const perParcelScores: Array<ToolConfidence> = [];
    const allDisqualifiers: string[] = [];
    const missingEvidence: string[] = [];
    let totalScore = 0;

    for (const parcel of deal.parcels) {
      const scoreResultRaw = safeParseJson(
        await runTool(parcelTriageScore, {
          dealId: deal.id,
          address: parcel.address,
          currentZoning: parcel.currentZoning,
          acreage: toNumber(parcel.acreage),
          proposedUse: deal.sku,
          floodZone: parcel.floodZone,
          futureLandUse: parcel.futureLandUse,
          utilitiesAvailable: toBoolean(parcel.utilitiesNotes),
          frontageRoad: null,
          adjacentUses: null,
        }),
      );

      const scoreResult = scoreResultRaw as ToolConfidence | null;
      if (!scoreResult) {
        missingEvidence.push(`Parcel triage failed for ${parcel.address}`);
        continue;
      }

      totalScore += scoreResult.score;
      allDisqualifiers.push(
        ...scoreResult.disqualifiers
          .map((item) => {
            if (typeof item === "string") return item;
            if (!item || typeof item !== "object") return null;
            const label = item.label;
            return label ? String(label) : null;
          })
          .filter((value): value is string => !!value),
      );
      missingEvidence.push(
        ...scoreResult.dataGaps
          .map((item) => (typeof item === "string" ? item : null))
          .filter((value): value is string => !!value),
      );

      if (include_parcel_breakdown !== false) {
        perParcelScores.push(scoreResult);
      }
    }

    const avgScore =
      deal.parcels.length > 0 ? totalScore / deal.parcels.length : 0;
    const disqualifiers = uniqueValues(allDisqualifiers);
    const confidence = Math.max(0, Math.min(1, Math.round(avgScore) / 100));
    const decision: "KILL" | "HOLD" | "ADVANCE" =
      disqualifiers.length > 0 || avgScore < 45
        ? "HOLD"
        : avgScore >= 70
          ? "ADVANCE"
          : "HOLD";

    const missingEvidenceItems = uniqueValues(
      missingEvidence.length > 0
        ? missingEvidence
        : ["No explicit data gaps detected."],
    );

    return JSON.stringify({
      dealId: deal_id,
      score: Math.round(avgScore * 10) / 10,
      decision,
      confidence,
      disqualifiers,
      requiredEvidence: missingEvidenceItems,
      narrative:
        decision === "ADVANCE"
          ? "No blocking conditions identified in current data set."
          : "One or more hard blockers or missing parcels remain for full underwriting.",
      parcelCount: deal.parcels.length,
      parcelBreakdown: include_parcel_breakdown === false ? [] : perParcelScores,
      missingEvidence: missingEvidenceItems,
    });
  },
});

export const generate_dd_checklist = tool({
  name: "generate_dd_checklist",
  description:
    "Generate a due diligence checklist with phases, tasks, and required evidence references for a deal or jurisdiction.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    deal_id: z.string().uuid().nullable().describe("Optional deal to contextualize the checklist"),
    jurisdiction_id: z.string().uuid().nullable().describe("Optional jurisdiction id"),
    scope: z
      .enum(["STANDARD", "EXPEDITED"])
      .nullable()
      .describe("Checklist scope"),
  }),
  execute: async ({ orgId, deal_id, jurisdiction_id, scope }) => {
    if (!deal_id && !jurisdiction_id) {
      return JSON.stringify({ error: "deal_id or jurisdiction_id is required" });
    }

    let jurisdictionName: string | null = null;
    let sku = null;
    let parcelCount = 0;

    if (deal_id) {
      const deal = await prisma.deal.findFirst({
        where: { id: deal_id, orgId },
        include: { jurisdiction: true, parcels: true },
      });
      if (!deal) {
        return JSON.stringify({ error: "Deal not found or access denied" });
      }
      jurisdictionName = deal.jurisdiction.name;
      sku = deal.sku;
      parcelCount = deal.parcels.length;
    }

    if (!jurisdictionName && jurisdiction_id) {
      const jurisdiction = await prisma.jurisdiction.findFirst({
        where: { id: jurisdiction_id, orgId },
        select: { name: true },
      });
      if (!jurisdiction) {
        return JSON.stringify({ error: "Jurisdiction not found or access denied" });
      }
      jurisdictionName = jurisdiction.name;
    }

    const phases = [
      {
        phase: "Data",
        requiredEvidence: ["parcel details", "zoning", "flood zone"] ,
        tasks: ["Confirm parcel identifiers", "Attach assessor parcel data", "Run flood/soils/wetlands screens"],
      },
      {
        phase: "Policy",
        requiredEvidence: ["Jurisdiction zoning matrix", "entitlement path rules"],
        tasks: ["Confirm permitted/conditional path", "Draft entitlement sequence", "Attach seed source references"],
      },
      {
        phase: "Environment",
        requiredEvidence: ["EPA/soil/wetland notes", "LDEQ permits"],
        tasks: ["Run wetland and ESA checks", "Collect environmental permit status", "Validate cleanup obligations"],
      },
      {
        phase: "Commercial",
        requiredEvidence: ["Comps", "access analysis", "utility maps"],
        tasks: ["Run sales comps", "Validate access and frontage", "Collect utility availability notes"],
      },
      {
        phase: "Finance",
        requiredEvidence: ["underwriting assumptions", "exit scenarios"],
        tasks: ["Run underwriting baseline", "Build risk-case stress scenarios", "Finalize LOI gate conditions"],
      },
    ];

    const scopeLabel = scope ?? "STANDARD";
    if (scopeLabel === "EXPEDITED") {
      for (const phase of phases) {
        phase.tasks = phase.tasks.slice(0, 2);
      }
    }

    return JSON.stringify({
      jurisdiction: jurisdictionName,
      dealId: deal_id,
      sku,
      scope: scopeLabel,
      parcelCount,
      checklist: phases,
      generatedAt: new Date().toISOString(),
      missingEvidence:
        scopeLabel === "EXPEDITED" && parcelCount === 0
          ? ["Parcel geometry and acreage"]
          : [],
      status: "generated",
      confidence: scopeLabel === "EXPEDITED" ? 0.75 : 0.89,
    });
  },
});

export const run_underwriting = tool({
  name: "run_underwriting",
  description:
    "Run deterministic underwriting from deal assumptions or direct inputs and return sensitivity outputs.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    deal_id: z
      .string()
      .uuid()
      .nullable()
      .describe("Optional deal to seed assumptions from stored financial data"),
    assumptions: z
      .object({
        purchase_price: z.number().nullable().optional(),
        noi: z.number().nullable().optional(),
        exit_cap_rate: z.number().nullable().optional(),
        hold_years: z.number().nullable().optional(),
        loan_amount: z.number().nullable().optional(),
        interest_rate: z.number().nullable().optional(),
        amortization_years: z.number().nullable().optional(),
      })
      .nullable(),
    include_sensitivity: z
      .boolean()
      .nullable()
      .describe("Whether to generate a small sensitivity table"),
  }),
  execute: async ({ orgId, deal_id, assumptions, include_sensitivity }) => {
    let source: JSONObject | null = null;
    if (deal_id) {
      const deal = await prisma.deal.findFirst({
        where: { id: deal_id, orgId },
        select: { financialModelAssumptions: true },
      });
      if (!deal) {
        return JSON.stringify({ error: "Deal not found or access denied" });
      }
      source =
        (deal.financialModelAssumptions as JSONObject | null) ?? null;
    }

    const resolved = {
      purchase_price:
        toNumber(assumptions?.purchase_price) ?? toNumber(source?.purchase_price) ?? 2000000,
      noi:
        toNumber(assumptions?.noi) ?? toNumber(source?.noi) ?? 220000,
      exit_cap_rate:
        toNumber(assumptions?.exit_cap_rate) ??
        toNumber(source?.exit_cap_rate) ??
        0.07,
      hold_years: Math.max(
        1,
        toNumber(assumptions?.hold_years) ??
          toNumber(source?.hold_years) ??
          5,
      ),
      loan_amount:
        assumptions?.loan_amount !== undefined
          ? toNumber(assumptions.loan_amount)
          : toNumber(source?.loan_amount),
      interest_rate:
        assumptions?.interest_rate !== undefined
          ? toNumber(assumptions.interest_rate)
          : toNumber(source?.interest_rate) ?? 0.065,
      amortization_years:
        assumptions?.amortization_years !== undefined
          ? toNumber(assumptions.amortization_years)
          : toNumber(source?.amortization_years) ?? 25,
    };

    if (!resolved.purchase_price || !resolved.noi) {
      return JSON.stringify({
        error:
          "Missing required underwriting assumptions (purchase_price or noi). Provide direct assumptions or store financialModelAssumptions on the deal.",
      });
    }

    const baseProforma = safeParseJson(
      await runTool(calculate_proforma, {
        purchase_price: resolved.purchase_price,
        noi: resolved.noi,
        exit_cap_rate: resolved.exit_cap_rate,
        hold_years: resolved.hold_years,
        loan_amount: resolved.loan_amount,
        interest_rate: resolved.interest_rate,
        amortization_years: resolved.amortization_years,
      }),
    );

    const baseDebtSizing = safeParseJson(
      await runTool(calculate_debt_sizing, {
        noi: resolved.noi,
        dscr_target: 1.25,
        interest_rate: resolved.interest_rate ?? 0.065,
        amortization_years: resolved.amortization_years ?? 25,
      }),
    );

    const runSensitivity =
      include_sensitivity === false
        ? []
        : [
            {
              label: "Base",
              assumptions: { ...resolved },
              result: baseProforma,
            },
            {
              label: "NOI -10%",
              assumptions: { ...resolved, noi: resolved.noi * 0.9 },
              result: safeParseJson(
                await runTool(calculate_proforma, {
                  ...resolved,
                  noi: resolved.noi * 0.9,
                }),
              ),
            },
            {
              label: "NOI +10%",
              assumptions: { ...resolved, noi: resolved.noi * 1.1 },
              result: safeParseJson(
                await runTool(calculate_proforma, {
                  ...resolved,
                  noi: resolved.noi * 1.1,
                }),
              ),
            },
            {
              label: "Exit cap -50bps",
              assumptions: {
                ...resolved,
                exit_cap_rate: Math.max(0.001, resolved.exit_cap_rate - 0.005),
              },
              result: safeParseJson(
                await runTool(calculate_proforma, {
                  ...resolved,
                  exit_cap_rate: Math.max(0.001, resolved.exit_cap_rate - 0.005),
                }),
              ),
            },
            {
              label: "Exit cap +50bps",
              assumptions: {
                ...resolved,
                exit_cap_rate: resolved.exit_cap_rate + 0.005,
              },
              result: safeParseJson(
                await runTool(calculate_proforma, {
                  ...resolved,
                  exit_cap_rate: resolved.exit_cap_rate + 0.005,
                }),
              ),
            },
          ];

    return JSON.stringify({
      dealId: deal_id ?? null,
      assumptionsUsed: resolved,
      assumptionsSource: deal_id ? "stored_assumptions" : "direct_inputs",
      proforma: baseProforma,
      debtSizing: baseDebtSizing,
      sensitivity: runSensitivity,
      confidence: baseProforma ? 0.78 : 0.55,
      next_steps: [
        "Use official rent cap and sales comps to replace defaults",
        "Re-run with lease-up or occupancy assumptions",
      ],
    });
  },
});

export const summarize_comps = tool({
  name: "summarize_comps",
  description:
    "Summarize nearby comparable sales and return compact market metrics for quick underwriting context.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    address: z.string().nullable().describe("Subject parcel address"),
    jurisdiction_id: z.string().uuid().nullable().describe("Jurisdiction fallback scope"),
    parish: z.string().nullable().describe("Optional parish scope"),
    radius_miles: z
      .number()
      .nullable()
      .describe("Search radius for comparable sales"),
    subject_acreage: z.number().nullable().describe("Subject acreage"),
  }),
  execute: async ({ orgId, address, jurisdiction_id, parish, radius_miles, subject_acreage }) => {
    if (!address && !parish && !jurisdiction_id) {
      return JSON.stringify({
        error: "address, parish, or jurisdiction_id is required",
      });
    }

    let effectiveParish = parish ?? null;
    if (!effectiveParish && jurisdiction_id) {
      const jurisdiction = await prisma.jurisdiction.findFirst({
        where: { id: jurisdiction_id, orgId },
        select: { name: true },
      });
      if (!jurisdiction) {
        return JSON.stringify({ error: "Jurisdiction not found or access denied" });
      }
      effectiveParish = jurisdiction.name;
    }

    const searchAddress = address ?? `${effectiveParish} comparables`;
    const comparablePayload = safeParseJson(
      await runTool(search_comparable_sales, {
        address: searchAddress,
        radius_miles: radius_miles ?? 5,
        proposed_use: null,
        parish: effectiveParish,
      }),
    );

    const comparables = extractComparableRows(comparablePayload);

    const metricPayload =
      subject_acreage && comparables.length > 0
        ? safeParseJson(
            await runTool(calculate_market_metrics, {
              comparables: comparables as Array<{
                sale_price: number | null;
                acreage: number | null;
              }>,
              subject_acreage,
            }),
          )
        : null;

    return JSON.stringify({
      scope: {
        address: searchAddress,
        parish: effectiveParish,
        jurisdictionId: jurisdiction_id ?? null,
        radiusMiles: radius_miles ?? 5,
      },
      comparableCount: comparables.length,
      topComparable: comparables[0] ?? null,
      metrics: metricPayload ?? null,
      source: comparablePayload,
      status: "summarized",
    });
  },
});

export const evaluate_run = tool({
  name: "evaluate_run",
  description:
    "Evaluate a persisted run with basic trust signals and recommendations.",
  parameters: z.object({
    orgId: z.string().uuid().describe("The org ID for security scoping"),
    run_id: z.string().uuid().describe("Run ID to inspect"),
  }),
  execute: async ({ orgId, run_id }) => {
    const run = await prisma.run.findFirst({
      where: { id: run_id, orgId },
      select: {
        id: true,
        runType: true,
        status: true,
        error: true,
        outputJson: true,
        startedAt: true,
        finishedAt: true,
      },
    });

    if (!run) {
      return JSON.stringify({ error: "Run not found" });
    }

    const durationMs =
      run.startedAt && run.finishedAt
        ? run.finishedAt.getTime() - run.startedAt.getTime()
        : null;

    const parsedOutput =
      (run.outputJson as JSONObject | null) ?? {};

    const trustEvidence =
      parsedOutput.evidenceCitations &&
      Array.isArray(parsedOutput.evidenceCitations)
        ? parsedOutput.evidenceCitations
        : [];

    const missingEvidence =
      parsedOutput.missingEvidence &&
      Array.isArray(parsedOutput.missingEvidence)
        ? (parsedOutput.missingEvidence as string[])
        : [];

    const recommendations: string[] = [];
    if (run.status !== "succeeded") {
      recommendations.push("Re-run with stronger input coverage and valid tool context");
    }
    if (missingEvidence.length > 0) {
      recommendations.push("Address missing evidence before final approval");
    }
    if (durationMs && durationMs > 120000) {
      recommendations.push("Break out long-running work into smaller steps");
    }

    return JSON.stringify({
      runId: run.id,
      runType: run.runType,
      status: run.status,
      durationMs,
      startedAt: parseRunDate(run.startedAt),
      finishedAt: parseRunDate(run.finishedAt),
      confidence:
        typeof parsedOutput.confidence === "number"
          ? parsedOutput.confidence
          : run.status === "succeeded"
            ? 0.68
            : 0.31,
      evidenceCount: trustEvidence.length,
      evidenceCitations: trustEvidence,
      missingEvidence,
      recommendations,
      outputKeys: Object.keys(parsedOutput),
    });
  },
});
