const { dbMock } = vi.hoisted(() => ({
  dbMock: {
    prisma: {
      upload: { findFirst: vi.fn(), update: vi.fn() },
      task: { create: vi.fn() },
    },
  },
}));

vi.mock("@entitlement-os/db", () => dbMock);

import { classifyDocument, handleUploadCreated } from "../documents";

// --- classifyDocument pure function tests ---

describe("classifyDocument", () => {
  it("classifies title documents", () => {
    expect(classifyDocument("Title_Commitment_2024.pdf").kind).toBe("title");
  });

  it("classifies Phase I environmental", () => {
    expect(classifyDocument("Phase I ESA Report.pdf").kind).toBe("environmental");
  });

  it("classifies environmental site assessment", () => {
    expect(classifyDocument("Environmental Site Assessment.pdf").kind).toBe("environmental");
  });

  it("classifies survey/plat/boundary", () => {
    expect(classifyDocument("Boundary_Survey.pdf").kind).toBe("survey");
    expect(classifyDocument("Plat_Map.pdf").kind).toBe("survey");
  });

  it("classifies financial documents", () => {
    expect(classifyDocument("Appraisal_Report.pdf").kind).toBe("financial");
    expect(classifyDocument("Rent Roll Q4.xlsx").kind).toBe("financial");
    expect(classifyDocument("Lease_Agreement.pdf").kind).toBe("financial");
  });

  it("classifies legal documents", () => {
    expect(classifyDocument("LOI_Deal123.pdf").kind).toBe("legal");
    expect(classifyDocument("Letter of Intent.pdf").kind).toBe("legal");
    expect(classifyDocument("Purchase Agreement.docx").kind).toBe("legal");
    expect(classifyDocument("Zoning_Verification.pdf").kind).toBe("legal");
    expect(classifyDocument("Conditional Use Permit.pdf").kind).toBe("legal");
  });

  it("classifies flood/fema documents", () => {
    expect(classifyDocument("FEMA_Flood_Map.pdf").kind).toBe("environmental");
    expect(classifyDocument("FIRM Panel 12345.pdf").kind).toBe("environmental");
  });

  it("classifies geotechnical reports", () => {
    expect(classifyDocument("Geotech_Report.pdf").kind).toBe("environmental");
    expect(classifyDocument("Soils Report.pdf").kind).toBe("environmental");
  });

  it("classifies site plans", () => {
    expect(classifyDocument("Site Plan Rev3.pdf").kind).toBe("survey");
    expect(classifyDocument("Concept Plan.pdf").kind).toBe("survey");
  });

  it("classifies tax/assessment", () => {
    expect(classifyDocument("Tax_Assessment_2024.pdf").kind).toBe("financial");
  });

  it("classifies permits", () => {
    expect(classifyDocument("Permit_Application.pdf").kind).toBe("legal");
  });

  it("falls back to other for unknown files", () => {
    const result = classifyDocument("random_photo.jpg");
    expect(result.kind).toBe("other");
    expect(result.confidence).toBe(0.3);
    expect(result.rule).toBeNull();
  });

  it("returns confidence scores", () => {
    expect(classifyDocument("Title_Report.pdf").confidence).toBe(0.9);
    expect(classifyDocument("Phase I Report.pdf").confidence).toBe(0.85);
  });

  it("is case insensitive", () => {
    expect(classifyDocument("TITLE_REPORT.PDF").kind).toBe("title");
    expect(classifyDocument("phase i esa.pdf").kind).toBe("environmental");
  });
});

// --- handleUploadCreated handler tests ---

describe("handleUploadCreated", () => {
  beforeEach(() => vi.clearAllMocks());

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
      id: "u1", filename: "Title_Commitment.pdf", kind: "other",
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
      id: "u1", filename: "Title_Commitment.pdf", kind: "financial",
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
    // "photos.zip" would classify as "other" at 0.3 confidence — below threshold
    dbMock.prisma.upload.findFirst.mockResolvedValue({
      id: "u1", filename: "photos.zip", kind: "survey",
    });

    await handleUploadCreated({ type: "upload.created", dealId: "d", uploadId: "u1", orgId: "o" });

    // Classification is "other" at 0.3 < 0.7 threshold, different from "survey"
    // But since upload.kind !== "other" and classification.confidence < threshold, no action
    expect(dbMock.prisma.upload.update).not.toHaveBeenCalled();
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });

  it("creates review task when upload is 'other' and classification is also low confidence", async () => {
    // File that doesn't match any rule: kind=other, classification=other at 0.3
    dbMock.prisma.upload.findFirst.mockResolvedValue({
      id: "u1", filename: "random_file.xyz", kind: "other",
    });
    dbMock.prisma.task.create.mockResolvedValue({ id: "task-1" });

    await handleUploadCreated({ type: "upload.created", dealId: "d", uploadId: "u1", orgId: "o" });

    // kind=other, classification=other, confidence=0.3 < 0.7 threshold → review task
    expect(dbMock.prisma.task.create).toHaveBeenCalledTimes(1);
    const arg = dbMock.prisma.task.create.mock.calls[0][0];
    expect(arg.data.title).toContain("Classify uploaded document");
  });

  it("does nothing when upload kind matches classification", async () => {
    // Upload already classified as "title", our classification agrees
    dbMock.prisma.upload.findFirst.mockResolvedValue({
      id: "u1", filename: "Title_Report.pdf", kind: "title",
    });

    await handleUploadCreated({ type: "upload.created", dealId: "d", uploadId: "u1", orgId: "o" });

    // kind !== "other" and classification.kind === upload.kind → no action
    expect(dbMock.prisma.upload.update).not.toHaveBeenCalled();
    expect(dbMock.prisma.task.create).not.toHaveBeenCalled();
  });
});
