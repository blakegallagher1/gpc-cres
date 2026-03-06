import { beforeEach, describe, expect, it, vi } from "vitest";

const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      upload: { findFirst: vi.fn(), update: vi.fn() },
      task: { create: vi.fn() },
    },
  },
}));

const {
  documentProcessingServiceMock,
  processUploadMock,
  institutionalKnowledgeIngestServiceMock,
  ingestWorkbookUploadMock,
} = vi.hoisted(() => {
  const processUploadMock = vi.fn();
  const ingestWorkbookUploadMock = vi.fn();
  return {
    processUploadMock,
    ingestWorkbookUploadMock,
    documentProcessingServiceMock: vi.fn(() => ({ processUpload: processUploadMock })),
    institutionalKnowledgeIngestServiceMock: vi.fn(() => ({
      ingestWorkbookUpload: ingestWorkbookUploadMock,
    })),
  };
});

vi.mock("@entitlement-os/db", () => dbMock);

vi.mock("@/lib/services/documentProcessing.service", () => ({
  getDocumentProcessingService: documentProcessingServiceMock,
}));

vi.mock("@/lib/services/institutionalKnowledgeIngest.service", () => ({
  getInstitutionalKnowledgeIngestService: institutionalKnowledgeIngestServiceMock,
}));

import { classifyDocument, handleUploadCreated } from "../documents";

describe("classifyDocument", () => {
  it("classifies title documents", () => {
    expect(classifyDocument("Title_Commitment_2024.pdf").kind).toBe("title");
  });

  it("classifies environmental documents", () => {
    expect(classifyDocument("Phase I ESA Report.pdf").kind).toBe("environmental");
    expect(classifyDocument("Environmental Site Assessment.pdf").kind).toBe("environmental");
    expect(classifyDocument("Geotech_Report.pdf").kind).toBe("environmental");
  });

  it("classifies survey documents", () => {
    expect(classifyDocument("Boundary_Survey.pdf").kind).toBe("survey");
    expect(classifyDocument("Concept Plan.pdf").kind).toBe("survey");
  });

  it("classifies financial documents", () => {
    expect(classifyDocument("Appraisal_Report.pdf").kind).toBe("financial");
    expect(classifyDocument("Rent Roll Q4.xlsx").kind).toBe("financial");
    expect(classifyDocument("Lease_Agreement.pdf").kind).toBe("financial");
  });

  it("classifies legal documents", () => {
    expect(classifyDocument("LOI_Deal123.pdf").kind).toBe("legal");
    expect(classifyDocument("Purchase Agreement.docx").kind).toBe("legal");
    expect(classifyDocument("Conditional Use Permit.pdf").kind).toBe("legal");
  });

  it("falls back to other for unknown files", () => {
    const result = classifyDocument("random_photo.jpg");
    expect(result.kind).toBe("other");
    expect(result.confidence).toBe(0.3);
    expect(result.rule).toBeNull();
  });

  it("is case insensitive", () => {
    expect(classifyDocument("TITLE_REPORT.PDF").kind).toBe("title");
    expect(classifyDocument("phase i esa.pdf").kind).toBe("environmental");
  });
});

describe("handleUploadCreated", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ignores non upload.created events", async () => {
    await handleUploadCreated({ type: "parcel.created", dealId: "d", parcelId: "p", orgId: "o" });
    expect(dbMock.prisma.upload.findFirst).not.toHaveBeenCalled();
  });

  it("returns if upload not found", async () => {
    dbMock.prisma.upload.findFirst.mockResolvedValue(null);

    await handleUploadCreated({ type: "upload.created", dealId: "d", uploadId: "u", orgId: "o" });

    expect(dbMock.prisma.upload.update).not.toHaveBeenCalled();
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("auto-classifies 'other' upload when high confidence match found", async () => {
    dbMock.prisma.upload.findFirst.mockResolvedValue({
      id: "u1",
      filename: "Title_Commitment.pdf",
      kind: "other",
    });

    await handleUploadCreated({ type: "upload.created", dealId: "d", uploadId: "u1", orgId: "o" });

    expect(dbMock.prisma.upload.update).toHaveBeenCalledWith({
      where: { id: "u1" },
      data: { kind: "title" },
    });
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("creates review task when user kind differs from high-confidence classification", async () => {
    dbMock.prisma.upload.findFirst.mockResolvedValue({
      id: "u1",
      filename: "Title_Commitment.pdf",
      kind: "financial",
    });
    dbMock.prisma.task.create.mockResolvedValue({ id: "task-1" });

    await handleUploadCreated({ type: "upload.created", dealId: "d", uploadId: "u1", orgId: "o" });

    expect(dbMock.prisma.upload.update).not.toHaveBeenCalled();
    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("[AUTO]");
    expect(arg.data.title).toContain("Review document classification");
  });

  it("does not create review task when user kind differs but classification is low confidence", async () => {
    dbMock.prisma.upload.findFirst.mockResolvedValue({
      id: "u1",
      filename: "photos.zip",
      kind: "survey",
    });

    await handleUploadCreated({ type: "upload.created", dealId: "d", uploadId: "u1", orgId: "o" });

    expect(dbMock.prisma.upload.update).not.toHaveBeenCalled();
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("creates review task when upload is 'other' and classification is also low confidence", async () => {
    dbMock.prisma.upload.findFirst.mockResolvedValue({
      id: "u1",
      filename: "random_file.xyz",
      kind: "other",
    });
    dbMock.prisma.task.create.mockResolvedValue({ id: "task-1" });

    await handleUploadCreated({ type: "upload.created", dealId: "d", uploadId: "u1", orgId: "o" });

    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("Classify uploaded document");
    expect(processUploadMock).not.toHaveBeenCalled();
  });

  it("triggers generic document processing when classification already matches a non-workbook upload", async () => {
    dbMock.prisma.upload.findFirst.mockResolvedValue({
      id: "u1",
      filename: "Title_Report.pdf",
      kind: "title",
    });

    await handleUploadCreated({ type: "upload.created", dealId: "d", uploadId: "u1", orgId: "o" });
    await vi.dynamicImportSettled();

    expect(documentProcessingServiceMock).toHaveBeenCalledTimes(1);
    expect(processUploadMock).toHaveBeenCalledWith("u1", "d", "o");
    expect(ingestWorkbookUploadMock).not.toHaveBeenCalled();
  });

  it("triggers institutional knowledge ingest for workbook uploads already classified as financial", async () => {
    dbMock.prisma.upload.findFirst.mockResolvedValue({
      id: "work-1",
      filename: "Rent Roll Workbook.xlsx",
      kind: "financial",
    });

    await handleUploadCreated({
      type: "upload.created",
      dealId: "deal-1",
      uploadId: "work-1",
      orgId: "org-1",
    });
    await vi.dynamicImportSettled();

    expect(institutionalKnowledgeIngestServiceMock).toHaveBeenCalledTimes(1);
    expect(ingestWorkbookUploadMock).toHaveBeenCalledWith("work-1", "deal-1", "org-1");
    expect(documentProcessingServiceMock).not.toHaveBeenCalled();
    expect(processUploadMock).not.toHaveBeenCalled();
  });

  it("auto-classifies 'other' workbook uploads to financial and ingests them", async () => {
    dbMock.prisma.upload.findFirst.mockResolvedValue({
      id: "work-2",
      filename: "Rent Roll Workbook.xlsx",
      kind: "other",
    });

    await handleUploadCreated({
      type: "upload.created",
      dealId: "deal-2",
      uploadId: "work-2",
      orgId: "org-2",
    });
    await vi.dynamicImportSettled();

    expect(dbMock.prisma.upload.update).toHaveBeenCalledWith({
      where: { id: "work-2" },
      data: { kind: "financial" },
    });
    expect(ingestWorkbookUploadMock).toHaveBeenCalledWith("work-2", "deal-2", "org-2");
    expect(processUploadMock).not.toHaveBeenCalled();
  });

  it("skips workbook ingest when auto-classifying an 'other' workbook to a non-financial kind", async () => {
    dbMock.prisma.upload.findFirst.mockResolvedValue({
      id: "work-3",
      filename: "Title_Commitment.xlsx",
      kind: "other",
    });

    await handleUploadCreated({
      type: "upload.created",
      dealId: "deal-3",
      uploadId: "work-3",
      orgId: "org-3",
    });
    await vi.dynamicImportSettled();

    expect(dbMock.prisma.upload.update).toHaveBeenCalledWith({
      where: { id: "work-3" },
      data: { kind: "title" },
    });
    expect(institutionalKnowledgeIngestServiceMock).not.toHaveBeenCalled();
    expect(ingestWorkbookUploadMock).not.toHaveBeenCalled();
    expect(processUploadMock).not.toHaveBeenCalled();
  });
});
