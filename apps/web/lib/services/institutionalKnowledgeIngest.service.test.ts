import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const {
  uploadFindFirstMock,
  documentExtractionUpsertMock,
  fetchObjectBytesFromGatewayMock,
  systemAuthMock,
  ensureInstitutionalKnowledgeCollectionReadyMock,
  ingestKnowledgeMock,
  searchKnowledgeBaseMock,
} = vi.hoisted(() => ({
  uploadFindFirstMock: vi.fn(),
  documentExtractionUpsertMock: vi.fn(),
  fetchObjectBytesFromGatewayMock: vi.fn(),
  systemAuthMock: vi.fn(),
  ensureInstitutionalKnowledgeCollectionReadyMock: vi.fn(),
  ingestKnowledgeMock: vi.fn(),
  searchKnowledgeBaseMock: vi.fn(),
}));

vi.mock("@entitlement-os/db", () => ({
  prisma: {
    upload: {
      findFirst: uploadFindFirstMock,
    },
    documentExtraction: {
      upsert: documentExtractionUpsertMock,
    },
  },
}));

vi.mock("@/lib/storage/gatewayStorage", () => ({
  fetchObjectBytesFromGateway: fetchObjectBytesFromGatewayMock,
  systemAuth: systemAuthMock,
}));

vi.mock("@/lib/services/knowledgeBase.service", () => ({
  ensureInstitutionalKnowledgeCollectionReady: ensureInstitutionalKnowledgeCollectionReadyMock,
  ingestKnowledge: ingestKnowledgeMock,
  searchKnowledgeBase: searchKnowledgeBaseMock,
}));

import { getInstitutionalKnowledgeIngestService, isWorkbookFilename } from "./institutionalKnowledgeIngest.service";

function buildWorkbookBuffer(): Buffer {
  const workbook = XLSX.utils.book_new();
  const dashboard = XLSX.utils.aoa_to_sheet([
    ["Asset Type", "Flex Warehouse"],
    ["Buildings", 2],
    ["Units", 24],
    ["Rentable SF", 24000],
    ["Construction Period", 12],
    ["Lease Up", 10],
    ["Hold Period", 60],
    ["Base Rent", 14],
    ["Total Project Cost", 5100000],
    ["Loan Amount", 3570000],
    ["LTC", "70%"],
    ["NOI", 612000],
    ["Sale Price", 7650000],
    ["Levered IRR", "28.29%"],
    ["Unlevered IRR", "11.72%"],
    ["Equity Multiple", "2.60"],
    ["Exit Cap", "8.0%"],
  ]);
  const assumptions = XLSX.utils.aoa_to_sheet([
    ["Sheet", "Assumptions"],
    ["Deal Name", "The Collective Office-Warehouse"],
  ]);

  XLSX.utils.book_append_sheet(workbook, dashboard, "Dashboard");
  XLSX.utils.book_append_sheet(workbook, assumptions, "Assumptions");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("institutionalKnowledgeIngest.service", () => {
  beforeEach(() => {
    uploadFindFirstMock.mockReset();
    documentExtractionUpsertMock.mockReset();
    fetchObjectBytesFromGatewayMock.mockReset();
    systemAuthMock.mockReset();
    ensureInstitutionalKnowledgeCollectionReadyMock.mockReset();
    ingestKnowledgeMock.mockReset();
    searchKnowledgeBaseMock.mockReset();

    systemAuthMock.mockReturnValue({ kind: "system-auth" });
    ensureInstitutionalKnowledgeCollectionReadyMock.mockResolvedValue({
      enabled: true,
      collection: "institutional_knowledge",
      denseVectorName: "dense",
    });
    ingestKnowledgeMock.mockResolvedValue(["knowledge-1", "knowledge-2"]);
    searchKnowledgeBaseMock.mockImplementation(
      async (_orgId: string, query: string, _types: string[] | undefined, _limit: number, mode: string) => {
        if (mode === "exact") {
          return [
            {
              id: "knowledge-1",
              contentType: "document_extraction",
              sourceId: query,
              contentText: "Exact knowledge hit",
              metadata: { verified: true },
              similarity: 1,
              createdAt: "2026-03-06T00:00:00.000Z",
            },
          ];
        }
        return [
          {
            id: "knowledge-2",
            contentType: "document_extraction",
            sourceId: "deal-model:the-collective-office-warehouse-13465-s-harrells-ferry-rd-baton-rouge-la-70816:upload-1",
            contentText: "Semantic knowledge hit",
            metadata: { verified: true },
            similarity: 0.93,
            createdAt: "2026-03-06T00:00:00.000Z",
          },
        ];
      }
    );
    documentExtractionUpsertMock.mockResolvedValue({ id: "document-extraction-1" });
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("recognizes supported workbook filenames", () => {
    expect(isWorkbookFilename("model.xlsx")).toBe(true);
    expect(isWorkbookFilename("model.xlsm")).toBe(true);
    expect(isWorkbookFilename("memo.pdf")).toBe(false);
  });

  it("rejects unsupported uploads before touching storage", async () => {
    uploadFindFirstMock.mockResolvedValue({
      id: "upload-1",
      orgId: "org-1",
      dealId: "deal-1",
      filename: "notes.pdf",
      contentType: "application/pdf",
      sizeBytes: 100,
      storageObjectKey: "uploads/notes.pdf",
      createdAt: new Date("2026-03-06T00:00:00.000Z"),
      user: { id: "user-1", email: "blake@example.com" },
    });

    await expect(
      getInstitutionalKnowledgeIngestService().ingestWorkbookUpload("upload-1", "deal-1", "org-1")
    ).rejects.toThrow("not a supported workbook");

    expect(fetchObjectBytesFromGatewayMock).not.toHaveBeenCalled();
    expect(ingestKnowledgeMock).not.toHaveBeenCalled();
  });

  it("extracts workbook summary, preserves artifact provenance, and verifies exact plus semantic retrieval", async () => {
    const filename = "The Collective Office-Warehouse(13465 S Harrells Ferry Rd, Baton Rouge, LA 70816).xlsx";
    const workbookBytes = buildWorkbookBuffer();

    uploadFindFirstMock.mockResolvedValue({
      id: "upload-1",
      orgId: "org-1",
      dealId: "deal-1",
      filename,
      contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: workbookBytes.length,
      storageObjectKey: "uploads/the-collective.xlsx",
      createdAt: new Date("2026-03-06T00:00:00.000Z"),
      user: { id: "user-1", email: "blake@example.com" },
    });
    fetchObjectBytesFromGatewayMock.mockResolvedValue(workbookBytes);

    const result = await getInstitutionalKnowledgeIngestService().ingestWorkbookUpload(
      "upload-1",
      "deal-1",
      "org-1"
    );

    expect(systemAuthMock).toHaveBeenCalledWith("org-1");
    expect(fetchObjectBytesFromGatewayMock).toHaveBeenCalledWith(
      "uploads/the-collective.xlsx",
      { kind: "system-auth" }
    );
    expect(ensureInstitutionalKnowledgeCollectionReadyMock).toHaveBeenCalledTimes(1);
    expect(ingestKnowledgeMock).toHaveBeenCalledWith(
      "org-1",
      "document_extraction",
      result.sourceId,
      expect.stringContaining("Workbook summary for The Collective Office Warehouse"),
      expect.objectContaining({
        sourceType: "financial_model",
        dealName: expect.any(String),
        address: "13465 S Harrells Ferry Rd, Baton Rouge, LA 70816",
        sourceArtifact: expect.objectContaining({
          storageObjectKey: "uploads/the-collective.xlsx",
          uploadedByUserId: "user-1",
          uploadedByEmail: "blake@example.com",
        }),
      })
    );
    expect(searchKnowledgeBaseMock).toHaveBeenNthCalledWith(
      1,
      "org-1",
      result.sourceId,
      ["document_extraction"],
      3,
      "exact"
    );
    expect(searchKnowledgeBaseMock).toHaveBeenNthCalledWith(
      2,
      "org-1",
      expect.stringContaining("Flex Warehouse"),
      ["document_extraction"],
      3,
      "semantic"
    );
    expect(documentExtractionUpsertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uploadId: "upload-1" },
        create: expect.objectContaining({
          orgId: "org-1",
          dealId: "deal-1",
          uploadId: "upload-1",
          rawText: expect.stringContaining("Levered IRR: 28.29%"),
        }),
      })
    );

    expect(result).toEqual(
      expect.objectContaining({
        uploadId: "upload-1",
        documentExtractionId: "document-extraction-1",
        contentType: "document_extraction",
        sheetNames: ["Dashboard", "Assumptions"],
        artifact: expect.objectContaining({
          filename,
          storageObjectKey: "uploads/the-collective.xlsx",
          uploadedByUserId: "user-1",
          uploadedByEmail: "blake@example.com",
        }),
        knowledge: expect.objectContaining({
          collection: "institutional_knowledge",
          denseVectorName: "dense",
          chunks: 2,
          ids: ["knowledge-1", "knowledge-2"],
          exactVerified: true,
          semanticVerified: true,
        }),
      })
    );
    expect(result.metadata).toEqual(
      expect.objectContaining({
        sourceType: "financial_model",
        address: "13465 S Harrells Ferry Rd, Baton Rouge, LA 70816",
        buildings: 2,
        units: 24,
        rentableSf: 24000,
        leveredIrr: 0.2829,
        loanToCost: 0.7,
      })
    );
    expect(Number(result.metadata.unleveredIrr)).toBeCloseTo(0.1172, 6);
  });
});
