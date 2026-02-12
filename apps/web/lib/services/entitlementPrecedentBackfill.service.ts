import { prisma } from "@entitlement-os/db";
import { captureEvidence } from "@entitlement-os/evidence";
import { hashJsonSha256 } from "@entitlement-os/shared";

import { supabaseAdmin } from "@/lib/db/supabase";
import { upsertEntitlementOutcomePrecedent } from "@/lib/services/entitlementIntelligence.service";

type ConnectorType = "rss" | "socrata" | "arcgis" | "unknown";
type DecisionType = "approved" | "approved_with_conditions" | "denied" | "withdrawn";
type SkuType = "SMALL_BAY_FLEX" | "OUTDOOR_STORAGE" | "TRUCK_PARKING";

type ExternalPrecedentCandidate = {
  precedentKey: string;
  strategyKey: string;
  strategyLabel: string;
  decision: DecisionType;
  hearingBody: string | null;
  applicationType: string | null;
  submittedAt: string | null;
  decisionAt: string | null;
  timelineDays: number | null;
  conditions: string[];
  riskFlags: string[];
  sourceUrls: string[];
  confidence: number;
  notes: string | null;
  sku: SkuType | null;
};

type FieldPreset = {
  id: string;
  connector: ConnectorType;
  urlIncludes: string[];
  fieldMap: {
    rowId?: string[];
    title?: string[];
    description?: string[];
    decision?: string[];
    applicationType?: string[];
    hearingBody?: string[];
    submittedAt?: string[];
    decisionAt?: string[];
    sourceUrls?: string[];
  };
  strategyHints?: Array<{ contains: string[]; strategyKey: string; strategyLabel: string }>;
  decisionValueMap?: Record<string, DecisionType>;
  confidenceBoost?: number;
};

type IngestSourceResult = {
  sourceUrl: string;
  connector: ConnectorType;
  fetchedRecords: number;
  attemptedPrecedents: number;
  upsertedPrecedents: number;
  skippedRecords: number;
  errors: string[];
};

export interface BackfillEntitlementPrecedentsInput {
  orgId: string;
  runId: string;
  jurisdictionId?: string | null;
  sourceLimit?: number;
  recordsPerSource?: number;
  evidenceLinksPerRecord?: number;
}

export interface BackfillEntitlementPrecedentsResult {
  orgId: string;
  jurisdictionCount: number;
  sourceCount: number;
  connectorCounts: Record<ConnectorType, number>;
  fetchedRecords: number;
  attemptedPrecedents: number;
  upsertedPrecedents: number;
  skippedRecords: number;
  errorCount: number;
  results: IngestSourceResult[];
}

const DEFAULT_SOURCE_LIMIT = 25;
const DEFAULT_RECORDS_PER_SOURCE = 75;
const DEFAULT_EVIDENCE_LINKS = 2;
const EVIDENCE_BUCKET = "evidence";

const BATON_ROUGE_FIELD_PRESETS: FieldPreset[] = [
  {
    id: "brla-socrata-zoning-cases",
    connector: "socrata",
    urlIncludes: ["data.brla.gov", "/resource/"],
    fieldMap: {
      rowId: ["case_number", "case_no", "docket_no", "id"],
      title: ["case_name", "project_name", "title", "request"],
      description: ["summary", "description", "staff_report", "notes"],
      decision: ["decision", "action", "disposition", "outcome", "status", "vote_result"],
      applicationType: ["application_type", "request_type", "case_type", "permit_type"],
      hearingBody: ["hearing_body", "board", "commission", "committee", "decision_body"],
      submittedAt: ["filed_date", "submitted_date", "application_date", "received_date"],
      decisionAt: ["decision_date", "hearing_date", "vote_date", "meeting_date"],
      sourceUrls: ["document_url", "staff_report_url", "agenda_url", "minutes_url", "packet_url"],
    },
    strategyHints: [
      {
        contains: ["conditional use", "cup"],
        strategyKey: "conditional_use_permit",
        strategyLabel: "Conditional Use Permit",
      },
      {
        contains: ["rezoning", "zoning map amendment"],
        strategyKey: "rezoning",
        strategyLabel: "Rezoning",
      },
      {
        contains: ["variance", "boa"],
        strategyKey: "variance",
        strategyLabel: "Variance",
      },
    ],
    decisionValueMap: {
      approved: "approved",
      approve: "approved",
      granted: "approved",
      denied: "denied",
      deny: "denied",
      rejected: "denied",
      withdrawn: "withdrawn",
      tabled: "withdrawn",
      continued: "withdrawn",
      "approved with conditions": "approved_with_conditions",
      conditional: "approved_with_conditions",
      a: "approved",
      d: "denied",
      w: "withdrawn",
      c: "approved_with_conditions",
    },
    confidenceBoost: 0.08,
  },
  {
    id: "ebr-arcgis-zoning-cases",
    connector: "arcgis",
    urlIncludes: ["arcgis.com", "featureserver", "zoning"],
    fieldMap: {
      rowId: ["CASE_NO", "CASE_NUMBER", "DOCKET_NO", "OBJECTID", "GLOBALID"],
      title: ["PROJECT_NAME", "CASE_NAME", "REQUEST", "TITLE"],
      description: ["STAFF_NOTES", "DESCRIPTION", "SUMMARY", "COMMENTS"],
      decision: ["ACTION", "DECISION", "STATUS", "DISPOSITION", "RECOMMENDATION"],
      applicationType: ["REQUEST_TYPE", "CASE_TYPE", "APPLICATION_TYPE", "PERMIT_TYPE"],
      hearingBody: ["HEARING_BODY", "BOARD", "COMMISSION", "DECISION_BODY"],
      submittedAt: ["FILED_DATE", "APPLICATION_DATE", "RECEIVED_DATE", "SUBMIT_DATE"],
      decisionAt: ["DECISION_DATE", "HEARING_DATE", "VOTE_DATE", "MEETING_DATE"],
      sourceUrls: ["DOC_URL", "DOCUMENT_URL", "AGENDA_URL", "MINUTES_URL", "PACKET_URL"],
    },
    decisionValueMap: {
      approved: "approved",
      denied: "denied",
      withdrawn: "withdrawn",
      "approved w/ conditions": "approved_with_conditions",
      "approved with conditions": "approved_with_conditions",
      a: "approved",
      d: "denied",
      w: "withdrawn",
      c: "approved_with_conditions",
    },
    confidenceBoost: 0.1,
  },
];

function normalizeSpace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function safeText(value: unknown): string {
  if (typeof value === "string") return normalizeSpace(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return "";
}

function parseDate(value: unknown): string | null {
  const text = safeText(value);
  if (!text) return null;
  const date = new Date(text);
  if (Number.isNaN(date.valueOf())) return null;
  return date.toISOString().slice(0, 10);
}

function timelineDaysFromDates(submittedAt: string | null, decisionAt: string | null): number | null {
  if (!submittedAt || !decisionAt) return null;
  const submitted = new Date(submittedAt);
  const decided = new Date(decisionAt);
  if (Number.isNaN(submitted.valueOf()) || Number.isNaN(decided.valueOf())) return null;
  const diffMs = decided.getTime() - submitted.getTime();
  if (diffMs <= 0) return null;
  return Math.round(diffMs / 86_400_000);
}

function clampConfidence(value: number): number {
  return Math.max(0.2, Math.min(0.95, Number.isFinite(value) ? value : 0.5));
}

function normalizeDecisionToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function parseDecision(raw: string): { decision: DecisionType | null; confidence: number } {
  const text = raw.toLowerCase();
  if (!text) return { decision: null, confidence: 0.35 };
  if (/\bwithdraw(n|al)?\b|\btabled\b/.test(text)) {
    return { decision: "withdrawn", confidence: 0.9 };
  }
  if (/\bden(y|ied|ial)\b|\breject(ed|ion)?\b/.test(text)) {
    return { decision: "denied", confidence: 0.92 };
  }
  if (/\bapprove(d)?\b.*\bcondition/.test(text) || /\bconditional approval\b/.test(text)) {
    return { decision: "approved_with_conditions", confidence: 0.94 };
  }
  if (/\bapprove(d)?\b|\bgranted\b|\bpass(ed)?\b/.test(text)) {
    return { decision: "approved", confidence: 0.86 };
  }
  return { decision: null, confidence: 0.35 };
}

function parseDecisionWithPreset(
  raw: string,
  preset: FieldPreset | null,
): { decision: DecisionType | null; confidence: number } {
  const normalized = normalizeDecisionToken(raw);
  if (preset?.decisionValueMap?.[normalized]) {
    return {
      decision: preset.decisionValueMap[normalized],
      confidence: clampConfidence(0.93 + (preset.confidenceBoost ?? 0)),
    };
  }

  if (preset?.decisionValueMap) {
    const mapped = Object.entries(preset.decisionValueMap).find(([token]) => normalized.includes(token))?.[1];
    if (mapped) {
      return {
        decision: mapped,
        confidence: clampConfidence(0.86 + (preset.confidenceBoost ?? 0)),
      };
    }
  }

  return parseDecision(raw);
}

function inferStrategy(raw: string): { strategyKey: string; strategyLabel: string; confidence: number } {
  const text = raw.toLowerCase();
  if (/\bconditional use\b|\bcup\b/.test(text)) {
    return { strategyKey: "conditional_use_permit", strategyLabel: "Conditional Use Permit", confidence: 0.9 };
  }
  if (/\brezon(e|ing)\b|\bzoning map amendment\b/.test(text)) {
    return { strategyKey: "rezoning", strategyLabel: "Rezoning", confidence: 0.9 };
  }
  if (/\bvariance\b|\bboa\b|\bboard of adjustment\b/.test(text)) {
    return { strategyKey: "variance", strategyLabel: "Variance", confidence: 0.9 };
  }
  if (/\bplanned unit development\b|\bpud\b/.test(text)) {
    return { strategyKey: "planned_unit_development", strategyLabel: "Planned Unit Development", confidence: 0.85 };
  }
  if (/\bsite plan\b/.test(text)) {
    return { strategyKey: "site_plan_review", strategyLabel: "Site Plan Review", confidence: 0.75 };
  }
  return { strategyKey: "entitlement_general", strategyLabel: "General Entitlement Path", confidence: 0.45 };
}

function inferStrategyWithPreset(
  raw: string,
  preset: FieldPreset | null,
): { strategyKey: string; strategyLabel: string; confidence: number } {
  const normalized = raw.toLowerCase();
  if (preset?.strategyHints) {
    const matched = preset.strategyHints.find((hint) =>
      hint.contains.some((needle) => normalized.includes(needle.toLowerCase())),
    );
    if (matched) {
      return {
        strategyKey: matched.strategyKey,
        strategyLabel: matched.strategyLabel,
        confidence: clampConfidence(0.9 + (preset.confidenceBoost ?? 0)),
      };
    }
  }
  return inferStrategy(raw);
}

function inferSku(raw: string): SkuType | null {
  const text = raw.toLowerCase();
  if (/\btruck\b|\btrailer\b|\blogistics\b/.test(text)) return "TRUCK_PARKING";
  if (/\boutdoor storage\b|\bstorage yard\b/.test(text)) return "OUTDOOR_STORAGE";
  if (/\bflex\b|\bindustrial bay\b/.test(text)) return "SMALL_BAY_FLEX";
  return null;
}

function collectConditions(raw: string): string[] {
  if (!raw) return [];
  const matches = raw
    .split(/[\n.;]/g)
    .map((line) => normalizeSpace(line))
    .filter((line) => /\bcondition(s)?\b|\bsubject to\b|\brequire(d|ment)?\b/i.test(line))
    .slice(0, 8);
  return matches;
}

function collectRiskFlags(raw: string): string[] {
  const text = raw.toLowerCase();
  const flags = new Set<string>();
  if (/\bdefer(red)?\b|\bcontinued\b/.test(text)) flags.add("hearing_continued");
  if (/\bappeal\b/.test(text)) flags.add("appeal_risk");
  if (/\blawsuit\b|\blitigation\b/.test(text)) flags.add("litigation_risk");
  if (/\bflood\b/.test(text)) flags.add("flood_constraint");
  if (/\btraffic\b/.test(text)) flags.add("traffic_constraint");
  return [...flags];
}

function xmlTagValue(block: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const match = block.match(regex);
  if (!match) return null;
  return normalizeSpace(
    match[1]
      .replace(/<!\[CDATA\[|\]\]>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&quot;/g, "\"")
      .replace(/&#39;/g, "'")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">"),
  );
}

function detectConnectorType(sourceUrl: string): ConnectorType {
  const url = sourceUrl.toLowerCase();
  if (/(\.xml|\.rss)(\?|$)|\/rss(\/|$)|feed=/.test(url)) return "rss";
  if (url.includes("socrata.com") || /\/resource\/[\w-]+(\.json)?/.test(url)) return "socrata";
  if (url.includes("arcgis.com") && /(featureserver|mapserver|\/query)/.test(url)) return "arcgis";
  return "unknown";
}

function appendQuery(url: string, updates: Record<string, string>): string {
  const parsed = new URL(url);
  for (const [key, value] of Object.entries(updates)) {
    if (!parsed.searchParams.has(key)) parsed.searchParams.set(key, value);
  }
  return parsed.toString();
}

async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, {
    method: "GET",
    headers: { "user-agent": "gpc-entitlement-os/1.0 (+entitlement precedent backfill)" },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} fetching ${url}`);
  }
  return await res.text();
}

async function fetchJson(url: string): Promise<unknown> {
  const text = await fetchText(url);
  return JSON.parse(text);
}

async function fetchRssRecords(sourceUrl: string, limit: number): Promise<Array<Record<string, unknown>>> {
  const xml = await fetchText(sourceUrl);
  const itemBlocks = [...xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)].map((match) => match[0]);
  const entryBlocks = [...xml.matchAll(/<entry\b[\s\S]*?<\/entry>/gi)].map((match) => match[0]);
  const blocks = itemBlocks.length > 0 ? itemBlocks : entryBlocks;

  return blocks.slice(0, limit).map((block, index) => {
    const title = xmlTagValue(block, "title") ?? "";
    const description = xmlTagValue(block, "description") ?? xmlTagValue(block, "summary") ?? "";
    const guid = xmlTagValue(block, "guid") ?? xmlTagValue(block, "id") ?? `rss-${index + 1}`;
    const link =
      xmlTagValue(block, "link")
      ?? block.match(/<link[^>]+href=["']([^"']+)["']/i)?.[1]
      ?? "";
    const pubDate = xmlTagValue(block, "pubDate") ?? xmlTagValue(block, "updated") ?? xmlTagValue(block, "published");
    const enclosure = block.match(/<enclosure[^>]+url=["']([^"']+)["']/i)?.[1] ?? null;

    return {
      record_id: guid,
      title,
      description,
      decision_text: `${title} ${description}`.trim(),
      record_url: link || sourceUrl,
      document_url: enclosure ?? null,
      hearing_date: pubDate,
      source_type: "rss",
    };
  });
}

function normalizeSocrataEndpoint(sourceUrl: string): string {
  if (/\/resource\/[\w-]+\.json(\?|$)/i.test(sourceUrl)) return sourceUrl;
  if (/\/resource\/[\w-]+(\?|$)/i.test(sourceUrl)) {
    const withJson = sourceUrl.replace(/(\/resource\/[\w-]+)(\?|$)/i, "$1.json$2");
    return withJson;
  }
  return sourceUrl;
}

async function fetchSocrataRecords(sourceUrl: string, limit: number): Promise<Array<Record<string, unknown>>> {
  const endpoint = appendQuery(normalizeSocrataEndpoint(sourceUrl), { "$limit": String(limit) });
  const json = await fetchJson(endpoint);
  if (!Array.isArray(json)) return [];
  return json.filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null);
}

function normalizeArcGisEndpoint(sourceUrl: string): string {
  if (/\/query(\?|$)/i.test(sourceUrl)) return sourceUrl;
  return sourceUrl.replace(/\/$/, "") + "/query";
}

async function fetchArcGisRecords(sourceUrl: string, limit: number): Promise<Array<Record<string, unknown>>> {
  const endpoint = appendQuery(normalizeArcGisEndpoint(sourceUrl), {
    where: "1=1",
    outFields: "*",
    returnGeometry: "false",
    resultRecordCount: String(limit),
    f: "json",
  });
  const json = await fetchJson(endpoint);
  if (typeof json !== "object" || json === null) return [];
  const features = (json as { features?: unknown[] }).features ?? [];
  return features
    .map((feature) =>
      typeof feature === "object" && feature !== null
        ? ((feature as { attributes?: unknown }).attributes ?? feature)
        : null,
    )
    .filter((row): row is Record<string, unknown> => typeof row === "object" && row !== null);
}

function pickField<T extends Record<string, unknown>>(row: T, includes: string[]): string {
  const entries = Object.entries(row);
  const match = entries.find(([key]) => includes.some((needle) => key.toLowerCase().includes(needle)));
  return match ? safeText(match[1]) : "";
}

function rowLookup(row: Record<string, unknown>): Record<string, unknown> {
  const lookup: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    lookup[key.toLowerCase()] = value;
  }
  return lookup;
}

function pickExactField(row: Record<string, unknown>, keys?: string[]): string {
  if (!keys || keys.length === 0) return "";
  const lookup = rowLookup(row);
  for (const key of keys) {
    const text = safeText(lookup[key.toLowerCase()]);
    if (text) return text;
  }
  return "";
}

function pickExactDateField(row: Record<string, unknown>, keys?: string[]): string | null {
  if (!keys || keys.length === 0) return null;
  const lookup = rowLookup(row);
  for (const key of keys) {
    const parsed = parseDate(lookup[key.toLowerCase()]);
    if (parsed) return parsed;
  }
  return null;
}

function pickDateField<T extends Record<string, unknown>>(row: T, includes: string[]): string | null {
  for (const [key, value] of Object.entries(row)) {
    if (!includes.some((needle) => key.toLowerCase().includes(needle))) continue;
    const parsed = parseDate(value);
    if (parsed) return parsed;
  }
  return null;
}

function collectCandidateUrls(row: Record<string, unknown>, sourceUrl: string): string[] {
  const urls = new Set<string>();
  urls.add(sourceUrl);
  for (const [key, value] of Object.entries(row)) {
    if (!/(url|link|document|agenda|minutes|packet|pdf)/i.test(key)) continue;
    const text = safeText(value);
    if (/^https?:\/\//i.test(text)) urls.add(text);
  }
  return [...urls];
}

function collectCandidateUrlsWithPreset(
  row: Record<string, unknown>,
  sourceUrl: string,
  sourceUrlFields?: string[],
): string[] {
  const urls = new Set(collectCandidateUrls(row, sourceUrl));
  if (!sourceUrlFields || sourceUrlFields.length === 0) return [...urls];
  const lookup = rowLookup(row);
  for (const key of sourceUrlFields) {
    const text = safeText(lookup[key.toLowerCase()]);
    if (/^https?:\/\//i.test(text)) urls.add(text);
  }
  return [...urls];
}

function resolveFieldPreset(sourceUrl: string, connector: ConnectorType): FieldPreset | null {
  const source = sourceUrl.toLowerCase();
  return (
    BATON_ROUGE_FIELD_PRESETS.find(
      (preset) =>
        preset.connector === connector && preset.urlIncludes.every((needle) => source.includes(needle.toLowerCase())),
    ) ?? null
  );
}

function buildCandidateFromRow(
  jurisdictionId: string,
  sourceUrl: string,
  connector: ConnectorType,
  row: Record<string, unknown>,
  fallbackDecisionDate: string | null,
): ExternalPrecedentCandidate | null {
  const preset = resolveFieldPreset(sourceUrl, connector);
  const title =
    pickExactField(row, preset?.fieldMap.title)
    || pickField(row, ["title", "name", "case", "application", "project"]);
  const applicationType =
    pickExactField(row, preset?.fieldMap.applicationType)
    || pickField(row, ["application_type", "permit_type", "request_type", "case_type"])
    || null;
  const hearingBody =
    pickExactField(row, preset?.fieldMap.hearingBody)
    || pickField(row, ["hearing_body", "board", "commission", "committee"])
    || null;
  const description =
    pickExactField(row, preset?.fieldMap.description)
    || pickField(row, ["description", "summary", "notes", "details"]);
  const decisionField =
    pickExactField(row, preset?.fieldMap.decision)
    || pickField(row, ["decision", "status", "outcome", "result", "action"]);
  const body = [
    title,
    applicationType ?? "",
    hearingBody ?? "",
    description,
    decisionField,
  ]
    .filter(Boolean)
    .join(" ");

  const decisionText = body || JSON.stringify(row);
  const parsedDecision = parseDecisionWithPreset(decisionField || decisionText, preset);
  if (!parsedDecision.decision) {
    return null;
  }

  const strategy = inferStrategyWithPreset(body, preset);
  const submittedAt =
    pickExactDateField(row, preset?.fieldMap.submittedAt)
    ?? pickDateField(row, ["submitted", "filed", "application_date"]);
  const decisionAt =
    pickExactDateField(row, preset?.fieldMap.decisionAt)
    ?? pickDateField(row, ["decision", "hearing", "vote", "approval_date", "meeting_date"])
    ?? fallbackDecisionDate;
  const timelineDays = timelineDaysFromDates(submittedAt, decisionAt);
  const conditions = collectConditions(decisionText);
  const riskFlags = collectRiskFlags(decisionText);
  const sku = inferSku(body);
  const sourceUrls = collectCandidateUrlsWithPreset(row, sourceUrl, preset?.fieldMap.sourceUrls);
  const recordFingerprint = hashJsonSha256({
    jurisdictionId,
    sourceUrl,
    rowId:
      pickExactField(row, preset?.fieldMap.rowId)
      || pickField(row, ["id", "case", "record", "docket", "application_no", "application"]),
    strategyKey: strategy.strategyKey,
    decision: parsedDecision.decision,
    decisionAt,
    title,
  });
  const precedentKey = `ext:${recordFingerprint.slice(0, 20)}`;
  const confidence = clampConfidence(
    (parsedDecision.confidence + strategy.confidence) / 2 + (preset?.confidenceBoost ?? 0),
  );

  return {
    precedentKey,
    strategyKey: strategy.strategyKey,
    strategyLabel: strategy.strategyLabel,
    decision: parsedDecision.decision,
    hearingBody,
    applicationType,
    submittedAt,
    decisionAt,
    timelineDays,
    conditions,
    riskFlags,
    sourceUrls,
    confidence,
    notes: title ? `Source record: ${title}` : null,
    sku,
  };
}

async function captureEvidenceForCandidate(
  orgId: string,
  runId: string,
  officialDomains: string[],
  urls: string[],
  linkLimit: number,
): Promise<{ sourceEvidenceIds: string[]; sourceSnapshotIds: string[]; extractedTexts: string[] }> {
  const sourceEvidenceIds: string[] = [];
  const sourceSnapshotIds: string[] = [];
  const extractedTexts: string[] = [];

  for (const url of urls.slice(0, linkLimit)) {
    if (!/^https?:\/\//i.test(url)) continue;
    try {
      const result = await captureEvidence({
        url,
        orgId,
        runId,
        prisma,
        supabase: supabaseAdmin,
        evidenceBucket: EVIDENCE_BUCKET,
        allowPlaywrightFallback: false,
        officialDomains,
      });
      sourceEvidenceIds.push(result.sourceId);
      sourceSnapshotIds.push(result.snapshotId);
      if (result.extractedText.trim().length > 0) {
        extractedTexts.push(result.extractedText.slice(0, 8_000));
      }
    } catch {
      // Evidence capture failures on individual links should not fail the whole candidate.
    }
  }

  return { sourceEvidenceIds, sourceSnapshotIds, extractedTexts };
}

async function fetchConnectorRecords(
  sourceUrl: string,
  connector: ConnectorType,
  limit: number,
): Promise<Array<Record<string, unknown>>> {
  if (connector === "rss") return await fetchRssRecords(sourceUrl, limit);
  if (connector === "socrata") return await fetchSocrataRecords(sourceUrl, limit);
  if (connector === "arcgis") return await fetchArcGisRecords(sourceUrl, limit);
  return [];
}

async function ingestConnectorSource(params: {
  orgId: string;
  runId: string;
  jurisdictionId: string;
  officialDomains: string[];
  sourceUrl: string;
  connector: ConnectorType;
  recordLimit: number;
  evidenceLinkLimit: number;
}): Promise<IngestSourceResult> {
  const result: IngestSourceResult = {
    sourceUrl: params.sourceUrl,
    connector: params.connector,
    fetchedRecords: 0,
    attemptedPrecedents: 0,
    upsertedPrecedents: 0,
    skippedRecords: 0,
    errors: [],
  };

  try {
    const records = await fetchConnectorRecords(params.sourceUrl, params.connector, params.recordLimit);
    result.fetchedRecords = records.length;

    for (const row of records) {
      const fallbackDecisionDate =
        params.connector === "rss"
          ? parseDate((row.pubDate ?? row.published ?? row.updated ?? row.hearing_date) as unknown)
          : null;
      const candidate = buildCandidateFromRow(
        params.jurisdictionId,
        params.sourceUrl,
        params.connector,
        row,
        fallbackDecisionDate,
      );

      if (!candidate) {
        result.skippedRecords += 1;
        continue;
      }

      result.attemptedPrecedents += 1;

      const evidence = await captureEvidenceForCandidate(
        params.orgId,
        params.runId,
        params.officialDomains,
        candidate.sourceUrls,
        params.evidenceLinkLimit,
      );

      const evidenceText = evidence.extractedTexts.join("\n");
      const textDecision = parseDecision(evidenceText);
      const finalDecision = textDecision.decision ?? candidate.decision;
      const finalConditions = [
        ...candidate.conditions,
        ...collectConditions(evidenceText),
      ].slice(0, 10);
      const finalRiskFlags = [
        ...candidate.riskFlags,
        ...collectRiskFlags(evidenceText),
      ].slice(0, 10);

      await upsertEntitlementOutcomePrecedent({
        orgId: params.orgId,
        jurisdictionId: params.jurisdictionId,
        precedentKey: candidate.precedentKey,
        strategyKey: candidate.strategyKey,
        strategyLabel: candidate.strategyLabel,
        decision: finalDecision,
        sku: candidate.sku,
        applicationType: candidate.applicationType,
        hearingBody: candidate.hearingBody,
        submittedAt: candidate.submittedAt,
        decisionAt: candidate.decisionAt,
        timelineDays: candidate.timelineDays,
        conditions: finalConditions,
        riskFlags: finalRiskFlags,
        sourceEvidenceIds: evidence.sourceEvidenceIds,
        sourceSnapshotIds: evidence.sourceSnapshotIds,
        confidence: clampConfidence((candidate.confidence + textDecision.confidence) / 2),
        notes: candidate.notes,
        createdBy: null,
      });
      result.upsertedPrecedents += 1;
    }
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

async function ingestUnstructuredSource(params: {
  orgId: string;
  runId: string;
  jurisdictionId: string;
  officialDomains: string[];
  sourceUrl: string;
}): Promise<IngestSourceResult> {
  const result: IngestSourceResult = {
    sourceUrl: params.sourceUrl,
    connector: "unknown",
    fetchedRecords: 1,
    attemptedPrecedents: 0,
    upsertedPrecedents: 0,
    skippedRecords: 0,
    errors: [],
  };

  try {
    const evidence = await captureEvidenceForCandidate(
      params.orgId,
      params.runId,
      params.officialDomains,
      [params.sourceUrl],
      1,
    );

    const extractedText = evidence.extractedTexts.join("\n");
    const decision = parseDecision(extractedText);
    if (!decision.decision) {
      result.skippedRecords = 1;
      return result;
    }

    const strategy = inferStrategy(extractedText);
    const decisionAt = parseDate(new Date().toISOString());
    const precedentKey = `doc:${hashJsonSha256({
      jurisdictionId: params.jurisdictionId,
      sourceUrl: params.sourceUrl,
      decision: decision.decision,
      strategy: strategy.strategyKey,
      excerpt: extractedText.slice(0, 500),
    }).slice(0, 20)}`;

    result.attemptedPrecedents = 1;
    await upsertEntitlementOutcomePrecedent({
      orgId: params.orgId,
      jurisdictionId: params.jurisdictionId,
      precedentKey,
      strategyKey: strategy.strategyKey,
      strategyLabel: strategy.strategyLabel,
      decision: decision.decision,
      submittedAt: null,
      decisionAt,
      timelineDays: null,
      conditions: collectConditions(extractedText),
      riskFlags: collectRiskFlags(extractedText),
      sourceEvidenceIds: evidence.sourceEvidenceIds,
      sourceSnapshotIds: evidence.sourceSnapshotIds,
      confidence: clampConfidence((strategy.confidence + decision.confidence) / 2),
      notes: "Backfilled from unstructured jurisdiction source text.",
      createdBy: null,
    });
    result.upsertedPrecedents = 1;
  } catch (error) {
    result.errors.push(error instanceof Error ? error.message : String(error));
  }

  return result;
}

export async function backfillEntitlementOutcomePrecedents(
  input: BackfillEntitlementPrecedentsInput,
): Promise<BackfillEntitlementPrecedentsResult> {
  const sourceLimit = Math.max(1, input.sourceLimit ?? DEFAULT_SOURCE_LIMIT);
  const recordsPerSource = Math.max(1, input.recordsPerSource ?? DEFAULT_RECORDS_PER_SOURCE);
  const evidenceLinksPerRecord = Math.max(1, input.evidenceLinksPerRecord ?? DEFAULT_EVIDENCE_LINKS);

  const jurisdictions = await prisma.jurisdiction.findMany({
    where: {
      orgId: input.orgId,
      ...(input.jurisdictionId ? { id: input.jurisdictionId } : {}),
    },
    include: {
      seedSources: {
        where: { active: true },
        orderBy: { createdAt: "desc" },
        take: sourceLimit,
      },
    },
  });

  const connectorCounts: Record<ConnectorType, number> = {
    rss: 0,
    socrata: 0,
    arcgis: 0,
    unknown: 0,
  };

  const results: IngestSourceResult[] = [];

  for (const jurisdiction of jurisdictions) {
    for (const source of jurisdiction.seedSources) {
      const connector = detectConnectorType(source.url);
      connectorCounts[connector] += 1;

      const ingestResult =
        connector === "unknown"
          ? await ingestUnstructuredSource({
              orgId: input.orgId,
              runId: input.runId,
              jurisdictionId: jurisdiction.id,
              officialDomains: jurisdiction.officialDomains,
              sourceUrl: source.url,
            })
          : await ingestConnectorSource({
              orgId: input.orgId,
              runId: input.runId,
              jurisdictionId: jurisdiction.id,
              officialDomains: jurisdiction.officialDomains,
              sourceUrl: source.url,
              connector,
              recordLimit: recordsPerSource,
              evidenceLinkLimit: evidenceLinksPerRecord,
            });
      results.push(ingestResult);
    }
  }

  return {
    orgId: input.orgId,
    jurisdictionCount: jurisdictions.length,
    sourceCount: connectorCounts.rss + connectorCounts.socrata + connectorCounts.arcgis + connectorCounts.unknown,
    connectorCounts,
    fetchedRecords: results.reduce((sum, item) => sum + item.fetchedRecords, 0),
    attemptedPrecedents: results.reduce((sum, item) => sum + item.attemptedPrecedents, 0),
    upsertedPrecedents: results.reduce((sum, item) => sum + item.upsertedPrecedents, 0),
    skippedRecords: results.reduce((sum, item) => sum + item.skippedRecords, 0),
    errorCount: results.reduce((sum, item) => sum + item.errors.length, 0),
    results,
  };
}

export const __testables = {
  BATON_ROUGE_FIELD_PRESETS,
  detectConnectorType,
  parseDecision,
  parseDecisionWithPreset,
  inferStrategy,
  inferStrategyWithPreset,
  resolveFieldPreset,
  buildCandidateFromRow,
  normalizeSocrataEndpoint,
  normalizeArcGisEndpoint,
};
