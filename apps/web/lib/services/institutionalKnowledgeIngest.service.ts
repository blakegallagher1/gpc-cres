import { createHash } from "node:crypto";
import path from "node:path";
import { prisma, type Prisma } from "@entitlement-os/db";
import { fetchObjectBytesFromGateway, systemAuth } from "@/lib/storage/gatewayStorage";
import {
  ensureInstitutionalKnowledgeCollectionReady,
  ingestKnowledge,
  searchKnowledgeBase,
  type KnowledgeSearchResult,
} from "@/lib/services/knowledgeBase.service";
import type ExcelJSNamespace from "exceljs";

type ExcelJSModule = typeof ExcelJSNamespace;

let _exceljs: ExcelJSModule | null = null;
async function getExcelJS(): Promise<ExcelJSModule> {
  if (!_exceljs) {
    const mod = (await import("exceljs")) as unknown as
      | ExcelJSModule
      | { default: ExcelJSModule };
    _exceljs = "default" in mod ? mod.default : mod;
  }
  return _exceljs;
}

const WORKBOOK_EXTENSIONS = new Set([".xlsx", ".xlsm", ".xls"]);
const MAX_SUMMARY_SHEETS = 6;
const MAX_PREVIEW_VALUES = 8;

export interface WorkbookKnowledgeIngestResult {
  uploadId: string;
  documentExtractionId: string;
  sourceId: string;
  contentType: "document_extraction";
  summary: string;
  metadata: Record<string, unknown>;
  sheetNames: string[];
  artifact: {
    filename: string;
    contentType: string;
    sizeBytes: number;
    storageObjectKey: string;
    sha256: string;
    uploadedByUserId: string;
    uploadedByEmail: string | null;
    uploadedAt: string;
  };
  knowledge: {
    collection: string;
    denseVectorName: string;
    chunks: number;
    ids: string[];
    exactVerified: boolean;
    semanticVerified: boolean;
    exactTopResult: KnowledgeSearchResult | null;
    semanticTopResult: KnowledgeSearchResult | null;
    semanticQuery: string;
  };
}

type UploadRecord = Awaited<ReturnType<typeof loadUpload>>;

type MetricCandidate = {
  value: string;
  sheet: string;
  row: number;
};

type WorkbookExtraction = {
  metadata: Record<string, unknown>;
  summary: string;
  sheetNames: string[];
  semanticQuery: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toInputJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function normalizeFilename(filename: string): string {
  return filename.replace(/\.[^.]+$/, "").trim();
}

export function isWorkbookFilename(filename: string): boolean {
  return WORKBOOK_EXTENSIONS.has(path.extname(filename).toLowerCase());
}

function extractAddressFromFilename(filename: string): string | null {
  const match = filename.match(/\(([^)]+)\)/);
  return match ? normalizeWhitespace(match[1] ?? "") || null : null;
}

function extractDealNameFromFilename(filename: string): string | null {
  const base = normalizeFilename(filename);
  const beforeParen = base.split("(")[0] ?? base;
  const cleaned = normalizeWhitespace(beforeParen.replace(/[_-]+/g, " "));
  return cleaned || null;
}

function normalizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  return normalizeWhitespace(String(value));
}

function parseNumericCandidate(raw: string): number | null {
  const cleaned = raw.replace(/[$,%(),]/g, "").replace(/\s+/g, "");
  if (!cleaned) return null;
  const numeric = Number(cleaned);
  return Number.isFinite(numeric) ? numeric : null;
}

function extractMetricCandidate(
  rows: string[][],
  labels: string[]
): MetricCandidate | null {
  const loweredLabels = labels.map((label) => label.toLowerCase());

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex] ?? [];
    const loweredRow = row.map((cell) => cell.toLowerCase());

    for (let cellIndex = 0; cellIndex < loweredRow.length; cellIndex += 1) {
      const cell = loweredRow[cellIndex] ?? "";
      if (!cell) continue;
      if (!loweredLabels.some((label) => cell.includes(label))) {
        continue;
      }

      for (let offset = 1; offset <= 3; offset += 1) {
        const nextCell = row[cellIndex + offset];
        const normalized = normalizeCell(nextCell);
        if (normalized) {
          return { value: normalized, sheet: "", row: rowIndex + 1 };
        }
      }

      for (const candidate of row) {
        const normalized = normalizeCell(candidate);
        if (!normalized || normalized.toLowerCase() === cell) continue;
        return { value: normalized, sheet: "", row: rowIndex + 1 };
      }
    }
  }

  return null;
}

function setMetricIfPresent(
  target: Record<string, unknown>,
  key: string,
  rawValue: string | null,
  parser: (value: string) => unknown = (value) => value
): void {
  if (!rawValue) return;
  const parsed = parser(rawValue);
  if (parsed === null || parsed === undefined || parsed === "") {
    return;
  }
  target[key] = parsed;
}

function parsePercent(raw: string): number | null {
  const numeric = parseNumericCandidate(raw);
  if (numeric === null) return null;
  return Math.abs(numeric) > 1 ? numeric / 100 : numeric;
}

function parseInteger(raw: string): number | null {
  const numeric = parseNumericCandidate(raw);
  return numeric === null ? null : Math.round(numeric);
}

function parseCurrency(raw: string): number | null {
  return parseNumericCandidate(raw);
}

interface ParsedSheet {
  sheetName: string;
  rows: string[][];
}

interface ParsedWorkbook {
  sheetNames: string[];
  sheets: ParsedSheet[];
}

function coerceExcelJsCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== "object") return String(value);
  // ExcelJS exposes formulas as { formula, result }, rich text as
  // { richText: [{ text }] }, hyperlinks as { text, hyperlink }, and errors
  // as { error: '#REF!' }. Coerce each shape to a primitive string before
  // the downstream metric extractor sees it.
  const obj = value as Record<string, unknown>;
  if ("result" in obj && obj.result !== undefined && obj.result !== null) {
    return coerceExcelJsCellValue(obj.result);
  }
  if (Array.isArray(obj.richText)) {
    return (obj.richText as Array<{ text?: string }>).map((part) => part?.text ?? "").join("");
  }
  if (typeof obj.text === "string") return obj.text;
  if (typeof obj.text !== "undefined") return String(obj.text);
  if (typeof obj.error === "string") return obj.error;
  return "";
}

async function parseWorkbookBuffer(buffer: Buffer): Promise<ParsedWorkbook> {
  const ExcelJS = await getExcelJS();
  const workbook = new ExcelJS.Workbook();
  // ExcelJS's `xlsx.load(buffer: Buffer)` typings predate the generic
  // `Buffer<ArrayBufferLike>` shape from modern @types/node, so the call
  // needs a structural cast. Runtime is unaffected.
  await workbook.xlsx.load(
    buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]
  );

  const sheets: ParsedSheet[] = [];
  workbook.eachSheet((worksheet) => {
    const rows: string[][] = [];
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      // ExcelJS row.values is a 1-indexed sparse array; index 0 is always empty.
      const rawValues = (row.values as unknown[]) ?? [];
      const cells: string[] = [];
      for (let i = 1; i < rawValues.length; i += 1) {
        cells.push(normalizeCell(coerceExcelJsCellValue(rawValues[i] ?? null)));
      }
      // Drop trailing empty cells (matches the previous filter that the
      // xlsx → JSON path performed when defval: "" was set).
      while (cells.length > 0 && cells[cells.length - 1] === "") {
        cells.pop();
      }
      rows.push(cells);
    });
    sheets.push({ sheetName: worksheet.name, rows });
  });

  return {
    sheetNames: sheets.map((sheet) => sheet.sheetName),
    sheets,
  };
}

function extractWorkbookFacts(parsed: ParsedWorkbook, filename: string): WorkbookExtraction {
  const sheetNames = parsed.sheetNames.slice();
  const rowsBySheet = parsed.sheets;

  const metadata: Record<string, unknown> = {
    sourceType: "financial_model",
    extractionVersion: 1,
    sheetNames,
    tags: ["institutional_knowledge", "financial_model", "underwriting"],
    qualityChecks: {
      workbookReadable: true,
      sheetCount: sheetNames.length,
    },
  };

  const address = extractAddressFromFilename(filename);
  const dealName = extractDealNameFromFilename(filename);
  setMetricIfPresent(metadata, "dealName", dealName);
  setMetricIfPresent(metadata, "address", address);

  const sheetLower = sheetNames.map((name) => name.toLowerCase());
  if (sheetLower.some((name) => name.includes("rent"))) {
    (metadata.tags as string[]).push("rent_roll");
  }
  if (sheetLower.some((name) => name.includes("waterfall"))) {
    (metadata.tags as string[]).push("waterfall");
  }
  if (sheetLower.some((name) => name.includes("sensitivity"))) {
    (metadata.tags as string[]).push("sensitivity");
  }

  const metricLookups: Array<{
    key: string;
    labels: string[];
    parser?: (value: string) => unknown;
  }> = [
    { key: "assetType", labels: ["asset type", "property type"] },
    { key: "buildings", labels: ["buildings", "building count"], parser: parseInteger },
    { key: "units", labels: ["units", "unit count"], parser: parseInteger },
    { key: "rentableSf", labels: ["rentable sf", "rsf", "square feet", "rentable square feet"], parser: parseInteger },
    { key: "constructionPeriodMonths", labels: ["construction period", "construction months"], parser: parseInteger },
    { key: "leaseUpMonths", labels: ["lease up", "lease-up"], parser: parseInteger },
    { key: "holdMonths", labels: ["hold period", "hold months"], parser: parseInteger },
    { key: "baseRentPerSf", labels: ["base rent", "rent / sf", "rent psf"], parser: parseCurrency },
    { key: "totalProjectCost", labels: ["total project cost", "total cost", "project cost"], parser: parseCurrency },
    { key: "loanAmount", labels: ["loan amount", "debt amount"], parser: parseCurrency },
    { key: "loanToCost", labels: ["ltc", "loan to cost"], parser: parsePercent },
    { key: "noi", labels: ["noi", "net operating income"], parser: parseCurrency },
    { key: "salePrice", labels: ["sale price", "terminal value", "exit value"], parser: parseCurrency },
    { key: "leveredIrr", labels: ["levered irr", "irr levered", "project irr"], parser: parsePercent },
    { key: "unleveredIrr", labels: ["unlevered irr", "irr unlevered"], parser: parsePercent },
    { key: "equityMultiple", labels: ["equity multiple", "multiple"], parser: parseCurrency },
    { key: "npv", labels: ["npv"], parser: parseCurrency },
    { key: "exitCapRate", labels: ["exit cap", "terminal cap"], parser: parsePercent },
  ];

  for (const lookup of metricLookups) {
    for (const { sheetName, rows } of rowsBySheet) {
      const candidate = extractMetricCandidate(rows, lookup.labels);
      if (!candidate) {
        continue;
      }
      candidate.sheet = sheetName;
      setMetricIfPresent(metadata, lookup.key, candidate.value, lookup.parser);
      if (lookup.key in metadata) {
        metadata[`${lookup.key}Source`] = { sheet: sheetName, row: candidate.row };
        break;
      }
    }
  }

  const previewBySheet = rowsBySheet.slice(0, MAX_SUMMARY_SHEETS).map(({ sheetName, rows }) => ({
    sheetName,
    sampleValues: rows
      .flatMap((row) => row)
      .map((cell) => normalizeCell(cell))
      .filter(Boolean)
      .slice(0, MAX_PREVIEW_VALUES),
  }));
  metadata.previewBySheet = previewBySheet;

  const qualityChecks = isRecord(metadata.qualityChecks) ? metadata.qualityChecks : {};
  qualityChecks.hasAddress = Boolean(address);
  qualityChecks.hasDealName = Boolean(dealName);
  qualityChecks.hasReturns = Boolean(metadata.leveredIrr || metadata.unleveredIrr || metadata.equityMultiple);
  qualityChecks.hasDebt = Boolean(metadata.loanAmount || metadata.loanToCost);
  qualityChecks.hasScale = Boolean(metadata.rentableSf || metadata.units || metadata.buildings);
  qualityChecks.foundMetricCount = metricLookups.filter(({ key }) => key in metadata).length;
  metadata.qualityChecks = qualityChecks;

  const summaryParts: string[] = [];
  const titleLine = [dealName, address].filter(Boolean).join(" — ");
  if (titleLine) {
    summaryParts.push(`Workbook summary for ${titleLine}.`);
  } else {
    summaryParts.push(`Workbook summary for uploaded financial model ${filename}.`);
  }

  const overviewBits = [
    metadata.assetType ? `Asset type: ${metadata.assetType}.` : null,
    metadata.buildings ? `Buildings: ${metadata.buildings}.` : null,
    metadata.units ? `Units: ${metadata.units}.` : null,
    metadata.rentableSf ? `Rentable SF: ${Number(metadata.rentableSf).toLocaleString()}.` : null,
    metadata.baseRentPerSf ? `Base rent / SF: ${metadata.baseRentPerSf}.` : null,
  ].filter(Boolean);
  if (overviewBits.length > 0) {
    summaryParts.push(overviewBits.join(" "));
  }

  const timingBits = [
    metadata.constructionPeriodMonths ? `Construction period: ${metadata.constructionPeriodMonths} months.` : null,
    metadata.leaseUpMonths ? `Lease-up: ${metadata.leaseUpMonths} months.` : null,
    metadata.holdMonths ? `Hold period: ${metadata.holdMonths} months.` : null,
  ].filter(Boolean);
  if (timingBits.length > 0) {
    summaryParts.push(timingBits.join(" "));
  }

  const capitalBits = [
    metadata.totalProjectCost ? `Total project cost: ${Number(metadata.totalProjectCost).toLocaleString()}.` : null,
    metadata.loanAmount ? `Loan amount: ${Number(metadata.loanAmount).toLocaleString()}.` : null,
    metadata.loanToCost ? `Loan-to-cost: ${(Number(metadata.loanToCost) * 100).toFixed(2)}%.` : null,
  ].filter(Boolean);
  if (capitalBits.length > 0) {
    summaryParts.push(capitalBits.join(" "));
  }

  const returnBits = [
    metadata.noi ? `NOI: ${Number(metadata.noi).toLocaleString()}.` : null,
    metadata.salePrice ? `Projected sale price: ${Number(metadata.salePrice).toLocaleString()}.` : null,
    metadata.leveredIrr ? `Levered IRR: ${(Number(metadata.leveredIrr) * 100).toFixed(2)}%.` : null,
    metadata.unleveredIrr ? `Unlevered IRR: ${(Number(metadata.unleveredIrr) * 100).toFixed(2)}%.` : null,
    metadata.equityMultiple ? `Equity multiple: ${Number(metadata.equityMultiple).toFixed(2)}x.` : null,
    metadata.exitCapRate ? `Exit cap rate: ${(Number(metadata.exitCapRate) * 100).toFixed(2)}%.` : null,
    metadata.npv ? `NPV: ${Number(metadata.npv).toLocaleString()}.` : null,
  ].filter(Boolean);
  if (returnBits.length > 0) {
    summaryParts.push(returnBits.join(" "));
  }

  if (previewBySheet.length > 0) {
    summaryParts.push(
      `Workbook structure: ${previewBySheet
        .map((preview) => `${preview.sheetName} [${preview.sampleValues.join(" | ")}]`)
        .join("; ")}.`
    );
  }

  const semanticQuery = [
    metadata.assetType,
    address,
    metadata.leveredIrr ? `levered IRR ${(Number(metadata.leveredIrr) * 100).toFixed(1)} percent` : null,
    metadata.loanToCost ? `loan to cost ${(Number(metadata.loanToCost) * 100).toFixed(1)} percent` : null,
    "underwriting financial model",
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");

  return {
    metadata,
    summary: summaryParts.join(" "),
    sheetNames,
    semanticQuery,
  };
}

async function loadUpload(uploadId: string, dealId: string, orgId: string) {
  return prisma.upload.findFirst({
    where: {
      id: uploadId,
      dealId,
      orgId,
    },
    include: {
      user: {
        select: {
          id: true,
          email: true,
        },
      },
    },
  });
}

function buildSourceId(upload: NonNullable<UploadRecord>, metadata: Record<string, unknown>): string {
  const address = typeof metadata.address === "string" ? metadata.address : null;
  const dealName = typeof metadata.dealName === "string" ? metadata.dealName : null;
  const slugBase = slugify([dealName, address ?? normalizeFilename(upload.filename)].filter(Boolean).join(" ")) || upload.id;
  return `deal-model:${slugBase}:${upload.id}`;
}

function serializeKnowledgeSearchResult(
  result: KnowledgeSearchResult | null
): Record<string, unknown> | null {
  if (!result) return null;
  return {
    id: result.id,
    contentType: result.contentType,
    sourceId: result.sourceId,
    contentText: result.contentText,
    metadata: result.metadata,
    similarity: result.similarity,
    createdAt: result.createdAt,
  };
}

class InstitutionalKnowledgeIngestService {
  async ingestWorkbookUpload(
    uploadId: string,
    dealId: string,
    orgId: string
  ): Promise<WorkbookKnowledgeIngestResult> {
    const upload = await loadUpload(uploadId, dealId, orgId);
    if (!upload) {
      throw new Error(`Upload ${uploadId} was not found for deal ${dealId}`);
    }
    if (!isWorkbookFilename(upload.filename)) {
      throw new Error(`Upload ${upload.filename} is not a supported workbook`);
    }
    if (!upload.storageObjectKey) {
      throw new Error(`Upload ${upload.filename} is missing storageObjectKey`);
    }

    const artifactBytes = Buffer.from(
      await fetchObjectBytesFromGateway(upload.storageObjectKey, systemAuth(orgId))
    );
    const sha256 = createHash("sha256").update(artifactBytes).digest("hex");
    const parsed = await parseWorkbookBuffer(artifactBytes);
    const extracted = extractWorkbookFacts(parsed, upload.filename);
    const sourceId = buildSourceId(upload, extracted.metadata);

    const artifactMetadata = {
      filename: upload.filename,
      contentType: upload.contentType,
      sizeBytes: upload.sizeBytes,
      storageObjectKey: upload.storageObjectKey,
      sha256,
      uploadedByUserId: upload.user.id,
      uploadedByEmail: upload.user.email,
      uploadedAt: upload.createdAt.toISOString(),
    };

    const metadata: Record<string, unknown> = {
      ...extracted.metadata,
      sourceId,
      sourceArtifact: artifactMetadata,
    };

    const collection = await ensureInstitutionalKnowledgeCollectionReady();
    const ids = await ingestKnowledge(
      orgId,
      "document_extraction",
      sourceId,
      extracted.summary,
      metadata
    );

    const exactResults = await searchKnowledgeBase(
      orgId,
      sourceId,
      ["document_extraction"],
      3,
      "exact"
    );
    const semanticResults = await searchKnowledgeBase(
      orgId,
      extracted.semanticQuery,
      ["document_extraction"],
      3,
      "semantic"
    );

    const exactTopResult = exactResults[0] ?? null;
    const semanticTopResult = semanticResults[0] ?? null;
    const exactVerified = exactTopResult?.sourceId === sourceId;
    const semanticVerified = semanticTopResult?.sourceId === sourceId;
    const knowledgeVerification = {
      exactVerified,
      semanticVerified,
      exactTopResult: serializeKnowledgeSearchResult(exactTopResult),
      semanticTopResult: serializeKnowledgeSearchResult(semanticTopResult),
      semanticQuery: extracted.semanticQuery,
    };

    const extractionRecord = await prisma.documentExtraction.upsert({
      where: { uploadId },
      update: {
        docType: "other",
        rawText: extracted.summary,
        extractedData: toInputJsonValue({
          ...metadata,
          knowledgeIds: ids,
          knowledgeVerification,
        }),
        confidence: exactVerified && semanticVerified ? 0.95 : 0.8,
      },
      create: {
        orgId,
        uploadId,
        dealId,
        docType: "other",
        rawText: extracted.summary,
        extractedData: toInputJsonValue({
          ...metadata,
          knowledgeIds: ids,
          knowledgeVerification,
        }),
        confidence: exactVerified && semanticVerified ? 0.95 : 0.8,
      },
      select: { id: true },
    });

    return {
      uploadId,
      documentExtractionId: extractionRecord.id,
      sourceId,
      contentType: "document_extraction",
      summary: extracted.summary,
      metadata,
      sheetNames: extracted.sheetNames,
      artifact: artifactMetadata,
      knowledge: {
        collection: collection.collection,
        denseVectorName: collection.denseVectorName,
        chunks: ids.length,
        ids,
        exactVerified,
        semanticVerified,
        exactTopResult,
        semanticTopResult,
        semanticQuery: extracted.semanticQuery,
      },
    };
  }
}

let ingestServiceSingleton: InstitutionalKnowledgeIngestService | null = null;

export function getInstitutionalKnowledgeIngestService(): InstitutionalKnowledgeIngestService {
  if (!ingestServiceSingleton) {
    ingestServiceSingleton = new InstitutionalKnowledgeIngestService();
  }
  return ingestServiceSingleton;
}
