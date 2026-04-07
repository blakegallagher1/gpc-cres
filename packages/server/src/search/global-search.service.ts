import { prisma } from "@entitlement-os/db";
import {
  getCloudflareAccessHeadersFromEnv,
  getPropertyDbConfigOrNull,
} from "../../../../apps/web/lib/server/propertyDbEnv";
import { searchKnowledgeBase } from "../../../../apps/web/lib/services/knowledgeBase.service";

export type GlobalSearchSource =
  | "deals"
  | "parcels"
  | "knowledge"
  | "runs"
  | "conversations";

export interface GlobalSearchDealResult {
  id: string;
  title: string;
  href: string;
  subtitle: string | null;
}

export interface GlobalSearchParcelResult {
  id: string;
  title: string;
  href: string;
  subtitle: string | null;
}

export interface GlobalSearchKnowledgeResult {
  id: string;
  title: string;
  href: string;
  subtitle: string | null;
}

export interface GlobalSearchRunResult {
  id: string;
  title: string;
  href: string;
  subtitle: string | null;
}

export interface GlobalSearchConversationResult {
  id: string;
  title: string;
  href: string;
  subtitle: string | null;
}

export interface GlobalSearchResponse {
  query: string;
  limit: number;
  groups: {
    deals: GlobalSearchDealResult[];
    parcels: GlobalSearchParcelResult[];
    knowledge: GlobalSearchKnowledgeResult[];
    runs: GlobalSearchRunResult[];
    conversations: GlobalSearchConversationResult[];
  };
  errors: Partial<Record<GlobalSearchSource, string>>;
}

type ParcelSearchRow = Record<string, unknown>;

type KnowledgeSearchRow = {
  id: string;
  contentText: string;
  contentType: string;
  sourceId: string;
  metadata: Record<string, unknown>;
};

const SOURCE_ERROR_MESSAGES: Record<GlobalSearchSource, string> = {
  deals: "Deal search is unavailable right now.",
  parcels: "Parcel search is unavailable right now.",
  knowledge: "Knowledge search is unavailable right now.",
  runs: "Run search is unavailable right now.",
  conversations: "Conversation search is unavailable right now.",
};

const DEAL_SKU_VALUES = ["SMALL_BAY_FLEX", "OUTDOOR_STORAGE", "TRUCK_PARKING"] as const;
const RUN_TYPE_VALUES = [
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
  "OPPORTUNITY_SCAN",
  "DEADLINE_MONITOR",
] as const;

function getMatchingEnumValues<T extends readonly string[]>(query: string, values: T): T[number][] {
  const normalized = query.trim().toUpperCase().replace(/[\s-]+/g, "_");
  if (!normalized) {
    return [];
  }

  return values.filter((value) => {
    const humanized = value.replace(/_/g, " ");
    return value.includes(normalized) || humanized.includes(query.trim().toUpperCase());
  });
}

function getString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function getKnowledgeTitle(row: KnowledgeSearchRow): string {
  const metadataTitle =
    getString(row.metadata.sourceTitle) ??
    getString(row.metadata.title) ??
    getString(row.metadata.name);

  if (metadataTitle) {
    return metadataTitle;
  }

  const preview = row.contentText.trim() || row.sourceId || "Knowledge match";
  return preview.length > 96 ? `${preview.slice(0, 96)}...` : preview;
}

function toDealResult(row: {
  id: string;
  name: string;
  status: string;
  sku: string;
  jurisdiction: { name: string } | null;
}): GlobalSearchDealResult {
  return {
    id: row.id,
    title: row.name,
    href: `/deals/${row.id}`,
    subtitle: [row.status, row.jurisdiction?.name, row.sku].filter(Boolean).join(" · ") || null,
  };
}

function toParcelResult(row: ParcelSearchRow): GlobalSearchParcelResult | null {
  const id =
    getString(row.id) ??
    getString(row.parcel_id) ??
    getString(row.parcelId) ??
    getString(row.parcel_uid) ??
    getString(row.parcelUid);
  if (!id) {
    return null;
  }

  const address =
    getString(row.address) ??
    getString(row.situs_address) ??
    getString(row.site_address) ??
    getString(row.label) ??
    id;
  const apn =
    getString(row.apn) ??
    getString(row.parcel_number) ??
    getString(row.parcelNumber);
  const zoning =
    getString(row.zoning) ??
    getString(row.zoning_type) ??
    getString(row.zoningType) ??
    getString(row.current_zoning) ??
    getString(row.currentZoning);

  return {
    id,
    title: address,
    href: `/map?parcel=${encodeURIComponent(id)}`,
    subtitle: [apn, zoning].filter(Boolean).join(" · ") || null,
  };
}

function toKnowledgeResult(row: KnowledgeSearchRow, query: string): GlobalSearchKnowledgeResult {
  return {
    id: row.id,
    title: getKnowledgeTitle(row),
    href: `/admin?tab=knowledge&search=${encodeURIComponent(row.sourceId || query)}`,
    subtitle: [row.contentType, row.sourceId].filter(Boolean).join(" · ") || null,
  };
}

function toRunResult(row: {
  id: string;
  runType: string;
  status: string;
  dealId: string | null;
  error: string | null;
}): GlobalSearchRunResult {
  return {
    id: row.id,
    title: row.runType,
    href: `/runs/${row.id}`,
    subtitle:
      [row.status, row.dealId ? `Deal ${row.dealId}` : null, row.error]
        .filter(Boolean)
        .join(" · ") || null,
  };
}

function toConversationResult(row: {
  id: string;
  title: string | null;
  dealId: string | null;
  _count: { messages: number };
}): GlobalSearchConversationResult {
  const href = new URLSearchParams({ conversationId: row.id });
  if (row.dealId) {
    href.set("dealId", row.dealId);
  }

  return {
    id: row.id,
    title: row.title ?? "Untitled conversation",
    href: `/chat?${href.toString()}`,
    subtitle: [row.dealId ? "Deal-linked" : "General", `${row._count.messages} messages`].join(
      " · ",
    ),
  };
}

function createEmptyResponse(query: string, limit: number): GlobalSearchResponse {
  return {
    query,
    limit,
    groups: {
      deals: [],
      parcels: [],
      knowledge: [],
      runs: [],
      conversations: [],
    },
    errors: {},
  };
}

function dedupeParcels(items: GlobalSearchParcelResult[]): GlobalSearchParcelResult[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    if (seen.has(item.id)) {
      return false;
    }
    seen.add(item.id);
    return true;
  });
}

async function searchDeals(orgId: string, query: string, limit: number): Promise<GlobalSearchDealResult[]> {
  const matchingSkus = getMatchingEnumValues(query, DEAL_SKU_VALUES);
  const rows = await prisma.deal.findMany({
    where: {
      orgId,
      OR: [
        { name: { contains: query, mode: "insensitive" } },
        { notes: { contains: query, mode: "insensitive" } },
        ...(matchingSkus.length > 0 ? [{ sku: { in: matchingSkus } }] : []),
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      name: true,
      status: true,
      sku: true,
      jurisdiction: { select: { name: true } },
    },
  });

  return rows.map(toDealResult);
}

async function searchRuns(orgId: string, query: string, limit: number): Promise<GlobalSearchRunResult[]> {
  const matchingRunTypes = getMatchingEnumValues(query, RUN_TYPE_VALUES);
  const rows = await prisma.run.findMany({
    where: {
      orgId,
      OR: [
        { error: { contains: query, mode: "insensitive" } },
        ...(matchingRunTypes.length > 0 ? [{ runType: { in: matchingRunTypes } }] : []),
      ],
    },
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      runType: true,
      status: true,
      dealId: true,
      error: true,
    },
  });

  return rows.map(toRunResult);
}

async function searchConversations(
  orgId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchConversationResult[]> {
  const rows = await prisma.conversation.findMany({
    where: {
      orgId,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { messages: { some: { content: { contains: query, mode: "insensitive" } } } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
    select: {
      id: true,
      title: true,
      dealId: true,
      _count: { select: { messages: true } },
    },
  });

  return rows.map(toConversationResult);
}

async function searchKnowledge(
  orgId: string,
  query: string,
  limit: number,
): Promise<GlobalSearchKnowledgeResult[]> {
  const rows = (await searchKnowledgeBase(
    orgId,
    query,
    undefined,
    limit,
    "auto",
  )) as KnowledgeSearchRow[];

  return rows.map((row) => toKnowledgeResult(row, query));
}

async function searchParcels(query: string, limit: number): Promise<GlobalSearchParcelResult[]> {
  const config = getPropertyDbConfigOrNull();
  if (!config) {
    return [];
  }

  const response = await fetch(
    `${config.url.replace(/\/$/, "")}/api/parcel/search?q=${encodeURIComponent(query)}&limit=${limit}`,
    {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${config.key}`,
        ...getCloudflareAccessHeadersFromEnv(),
      },
    },
  );

  if (!response.ok) {
    throw new Error(`Parcel gateway returned ${response.status}`);
  }

  const payload = (await response.json().catch(() => null)) as
    | ParcelSearchRow[]
    | { parcels?: ParcelSearchRow[]; results?: ParcelSearchRow[]; data?: ParcelSearchRow[] }
    | null;
  const rows = Array.isArray(payload)
    ? payload
    : payload?.parcels ?? payload?.results ?? payload?.data ?? [];

  return dedupeParcels(
    rows.map(toParcelResult).filter((item): item is GlobalSearchParcelResult => item !== null),
  ).slice(0, limit);
}

function applySettledResult<T>(
  response: GlobalSearchResponse,
  source: GlobalSearchSource,
  result: PromiseSettledResult<T>,
  onSuccess: (value: T) => void,
) {
  if (result.status === "fulfilled") {
    onSuccess(result.value);
    return;
  }

  response.errors[source] = SOURCE_ERROR_MESSAGES[source];
}

export async function runGlobalSearch(params: {
  orgId: string;
  query: string;
  limit: number;
}): Promise<GlobalSearchResponse> {
  const response = createEmptyResponse(params.query, params.limit);

  const [deals, parcels, knowledge, runs, conversations] = await Promise.allSettled([
    searchDeals(params.orgId, params.query, params.limit),
    searchParcels(params.query, params.limit),
    searchKnowledge(params.orgId, params.query, params.limit),
    searchRuns(params.orgId, params.query, params.limit),
    searchConversations(params.orgId, params.query, params.limit),
  ]);

  applySettledResult(response, "deals", deals, (value) => {
    response.groups.deals = value;
  });
  applySettledResult(response, "parcels", parcels, (value) => {
    response.groups.parcels = value;
  });
  applySettledResult(response, "knowledge", knowledge, (value) => {
    response.groups.knowledge = value;
  });
  applySettledResult(response, "runs", runs, (value) => {
    response.groups.runs = value;
  });
  applySettledResult(response, "conversations", conversations, (value) => {
    response.groups.conversations = value;
  });

  return response;
}
