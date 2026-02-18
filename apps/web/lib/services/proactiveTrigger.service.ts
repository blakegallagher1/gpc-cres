import { prisma, type Prisma } from "@entitlement-os/db";
import {
  executeProactiveAction,
  notifyPendingProactiveAction,
} from "@/lib/services/proactiveAction.service";
import { getStructuredPreferences } from "@/lib/services/preferenceService";

type ProactiveConditionOp =
  | "eq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "contains";
type ProactivePriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

export type ProactiveConditionInput = {
  field: string;
  op: ProactiveConditionOp;
  value: unknown;
};

export type CreateProactiveTriggerInput = {
  name: string;
  description?: string;
  triggerType: "SCHEDULED" | "EVENT" | "WEBHOOK" | "ANOMALY";
  triggerConfig: Record<string, unknown>;
  conditions: ProactiveConditionInput[];
  actionType: "NOTIFY" | "RUN_WORKFLOW" | "CREATE_TASK" | "AUTO_TRIAGE";
  actionConfig: Record<string, unknown>;
  requireApproval?: boolean;
  maxRunsPerDay?: number;
  maxAutoCost?: number;
  targetUsers?: string[];
};

function proactiveEnabled(): boolean {
  return (process.env.FEATURE_PROACTIVE_TRIGGERS ?? "").toLowerCase() === "true";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function getNestedValue(input: Record<string, unknown>, path: string): unknown {
  const parts = path.split(".").filter(Boolean);
  let current: unknown = input;
  for (const part of parts) {
    if (typeof current !== "object" || current === null || Array.isArray(current)) {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function conditionMatches(
  condition: ProactiveConditionInput,
  payload: Record<string, unknown>,
): boolean {
  const directValue = getNestedValue(payload, condition.field);
  const eventValue =
    directValue === undefined
      ? getNestedValue(payload, `payload.${condition.field}`)
      : directValue;

  switch (condition.op) {
    case "eq":
      return eventValue === condition.value;
    case "gt": {
      const left = asNumber(eventValue);
      const right = asNumber(condition.value);
      return left !== null && right !== null && left > right;
    }
    case "gte": {
      const left = asNumber(eventValue);
      const right = asNumber(condition.value);
      return left !== null && right !== null && left >= right;
    }
    case "lt": {
      const left = asNumber(eventValue);
      const right = asNumber(condition.value);
      return left !== null && right !== null && left < right;
    }
    case "lte": {
      const left = asNumber(eventValue);
      const right = asNumber(condition.value);
      return left !== null && right !== null && left <= right;
    }
    case "in":
      return Array.isArray(condition.value) && condition.value.includes(eventValue);
    case "contains":
      if (Array.isArray(eventValue)) return eventValue.includes(condition.value);
      if (typeof eventValue === "string") {
        return eventValue.toLowerCase().includes(String(condition.value).toLowerCase());
      }
      return false;
    default:
      return false;
  }
}

function allConditionsMatch(
  conditions: ProactiveConditionInput[],
  payload: Record<string, unknown>,
): boolean {
  if (conditions.length === 0) return true;
  return conditions.every((condition) => conditionMatches(condition, payload));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function eventField(payload: Record<string, unknown>, key: string): unknown {
  const direct = payload[key];
  if (direct !== undefined) return direct;
  const nestedPayload = asRecord(payload.payload);
  return nestedPayload[key];
}

async function computeMatchConfidence(
  orgId: string,
  userId: string,
  payload: Record<string, unknown>,
): Promise<number> {
  let confidence = 0.55;
  const prefs = await getStructuredPreferences(orgId, userId);

  const minAcreagePref = asNumber(prefs["DEAL_CRITERIA.minAcreage"]);
  const acreage = asNumber(eventField(payload, "acreage"));
  if (minAcreagePref !== null && acreage !== null) {
    confidence += acreage >= minAcreagePref ? 0.2 : -0.12;
  }

  const preferredJurisdictions = prefs["DEAL_CRITERIA.preferredJurisdictions"];
  const jurisdiction = eventField(payload, "jurisdiction");
  if (Array.isArray(preferredJurisdictions) && typeof jurisdiction === "string") {
    if (preferredJurisdictions.map(String).includes(jurisdiction)) confidence += 0.1;
  }

  const preferredSkus = prefs["DEAL_CRITERIA.preferredSkus"];
  const sku = eventField(payload, "sku");
  if (Array.isArray(preferredSkus) && typeof sku === "string") {
    if (preferredSkus.map(String).includes(sku)) confidence += 0.1;
  }

  return clamp(confidence, 0.1, 0.95);
}

function determinePriority(
  payload: Record<string, unknown>,
  confidence: number,
): ProactivePriority {
  if (payload.urgent === true) return "URGENT";
  if (confidence >= 0.85) return "HIGH";
  if (confidence >= 0.65) return "MEDIUM";
  return "LOW";
}

function shouldAutoExecute(params: {
  trigger: {
    requireApproval: boolean;
    maxAutoCost: number;
    maxRunsPerDay: number;
  };
  confidence: number;
  priority: ProactivePriority;
  runsToday: number;
  estimatedCost: number;
}): boolean {
  if (params.trigger.requireApproval) return false;
  if (params.confidence < 0.85) return false;
  if (params.priority === "URGENT") return false;
  if (params.runsToday >= params.trigger.maxRunsPerDay) return false;
  if (params.estimatedCost > params.trigger.maxAutoCost) return false;
  return true;
}

function summarizeEvent(eventType: string, payload: Record<string, unknown>): string {
  const dealId = eventField(payload, "dealId");
  const parcelId = eventField(payload, "parcelId");
  const taskId = eventField(payload, "taskId");
  const fragments = [
    `Event: ${eventType}`,
    typeof dealId === "string" ? `Deal: ${dealId}` : null,
    typeof parcelId === "string" ? `Parcel: ${parcelId}` : null,
    typeof taskId === "string" ? `Task: ${taskId}` : null,
  ].filter(Boolean);

  return fragments.join(" | ");
}

export async function createProactiveTrigger(
  orgId: string,
  userId: string,
  input: CreateProactiveTriggerInput,
) {
  return prisma.proactiveTrigger.create({
    data: {
      orgId,
      createdBy: userId,
      name: input.name,
      description: input.description ?? null,
      triggerType: input.triggerType,
      triggerConfig: toJson(input.triggerConfig),
      conditions: toJson(input.conditions),
      actionType: input.actionType,
      actionConfig: toJson(input.actionConfig),
      targetUsers: input.targetUsers ?? [],
      requireApproval: input.requireApproval ?? true,
      maxRunsPerDay: input.maxRunsPerDay ?? 10,
      maxAutoCost: input.maxAutoCost ?? 5,
      status: "ACTIVE",
    },
  });
}

export async function listProactiveTriggers(orgId: string) {
  return prisma.proactiveTrigger.findMany({
    where: { orgId },
    orderBy: { createdAt: "desc" },
  });
}

export async function evaluateProactiveEvent(params: {
  orgId: string;
  eventType: string;
  payload: Record<string, unknown>;
}): Promise<void> {
  if (!proactiveEnabled()) return;

  const triggers = await prisma.proactiveTrigger.findMany({
    where: {
      orgId: params.orgId,
      status: "ACTIVE",
      triggerType: "EVENT",
    },
  });

  if (triggers.length === 0) return;

  const dayStart = new Date();
  dayStart.setHours(0, 0, 0, 0);

  for (const trigger of triggers) {
    const config = asRecord(trigger.triggerConfig);
    const expectedEvent = typeof config.event === "string" ? config.event : null;
    if (expectedEvent && expectedEvent !== params.eventType) continue;

    const conditionsRaw = Array.isArray(trigger.conditions) ? trigger.conditions : [];
    const conditions = conditionsRaw
      .map((item) => asRecord(item))
      .filter((item) => typeof item.field === "string" && typeof item.op === "string")
      .map((item) => ({
        field: String(item.field),
        op: String(item.op) as ProactiveConditionOp,
        value: item.value,
      }));

    if (!allConditionsMatch(conditions, params.payload)) continue;

    const runsToday = await prisma.proactiveAction.count({
      where: {
        triggerId: trigger.id,
        createdAt: { gte: dayStart },
      },
    });
    if (runsToday >= trigger.maxRunsPerDay) continue;

    const confidence = await computeMatchConfidence(
      params.orgId,
      trigger.createdBy,
      params.payload,
    );
    if (confidence < 0.5) continue;

    const priority = determinePriority(params.payload, confidence);
    const actionConfig = asRecord(trigger.actionConfig);
    const estimatedCost = asNumber(actionConfig.estimatedCost) ?? 0;
    const autoExecute = shouldAutoExecute({
      trigger: {
        requireApproval: trigger.requireApproval,
        maxAutoCost: trigger.maxAutoCost,
        maxRunsPerDay: trigger.maxRunsPerDay,
      },
      confidence,
      priority,
      runsToday,
      estimatedCost,
    });

    const recipients = trigger.targetUsers.length > 0 ? trigger.targetUsers : [trigger.createdBy];
    let createdCount = 0;

    for (const recipient of recipients) {
      const action = await prisma.proactiveAction.create({
        data: {
          triggerId: trigger.id,
          orgId: params.orgId,
          userId: recipient,
          actionType: trigger.actionType,
          priority,
          title: trigger.name,
          description: trigger.description ?? summarizeEvent(params.eventType, params.payload),
          context: toJson({
            ...params.payload,
            eventType: params.eventType,
            confidence,
            estimatedCost,
          }),
          matchConfidence: confidence,
          status: autoExecute ? "AUTO_EXECUTED" : "PENDING",
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
      createdCount += 1;

      if (autoExecute) {
        await executeProactiveAction({ actionId: action.id, mode: "auto" });
      } else {
        await notifyPendingProactiveAction(action.id);
      }
    }

    if (createdCount > 0) {
      await prisma.proactiveTrigger.update({
        where: { id: trigger.id },
        data: {
          lastRunAt: new Date(),
          runCount: trigger.runCount + 1,
        },
      });
    }
  }
}
