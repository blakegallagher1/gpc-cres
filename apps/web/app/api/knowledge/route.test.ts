import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  searchKnowledgeBaseMock,
  ingestKnowledgeMock,
  getKnowledgeStatsMock,
  getRecentEntriesMock,
  deleteKnowledgeMock,
  resolveKnowledgeSearchModeMock,
  isKnowledgeSearchErrorMock,
  ingestWorkbookUploadMock,
  getInstitutionalKnowledgeIngestServiceMock,
  knowledgeContentTypesMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  searchKnowledgeBaseMock: vi.fn(),
  ingestKnowledgeMock: vi.fn(),
  getKnowledgeStatsMock: vi.fn(),
  getRecentEntriesMock: vi.fn(),
  deleteKnowledgeMock: vi.fn(),
  resolveKnowledgeSearchModeMock: vi.fn(),
  isKnowledgeSearchErrorMock: vi.fn(),
  ingestWorkbookUploadMock: vi.fn(),
  getInstitutionalKnowledgeIngestServiceMock: vi.fn(),
  knowledgeContentTypesMock: [
    "deal_memo",
    "agent_analysis",
    "document_extraction",
    "market_report",
    "user_note",
    "chat_capture",
    "outcome_record",
    "reasoning_trace",
    "episodic_summary",
    "procedural_skill",
    "trajectory_trace",
  ],
}));
const { shouldUseAppDatabaseDevFallbackMock } = vi.hoisted(() => ({
  shouldUseAppDatabaseDevFallbackMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/services/knowledgeBase.service", () => ({
  searchKnowledgeBase: searchKnowledgeBaseMock,
  ingestKnowledge: ingestKnowledgeMock,
  getKnowledgeStats: getKnowledgeStatsMock,
  getRecentEntries: getRecentEntriesMock,
  deleteKnowledge: deleteKnowledgeMock,
  KNOWLEDGE_CONTENT_TYPES: knowledgeContentTypesMock,
  resolveKnowledgeSearchMode: resolveKnowledgeSearchModeMock,
  isKnowledgeSearchError: isKnowledgeSearchErrorMock,
}));

vi.mock("@/lib/services/institutionalKnowledgeIngest.service", () => ({
  getInstitutionalKnowledgeIngestService: getInstitutionalKnowledgeIngestServiceMock,
}));

vi.mock("@/lib/server/appDbEnv", () => ({
  shouldUseAppDatabaseDevFallback: shouldUseAppDatabaseDevFallbackMock,
}));

import { GET, POST } from "./route";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "99999999-9999-4999-8999-999999999999";

describe("/api/knowledge route", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    searchKnowledgeBaseMock.mockReset();
    ingestKnowledgeMock.mockReset();
    getKnowledgeStatsMock.mockReset();
    getRecentEntriesMock.mockReset();
    deleteKnowledgeMock.mockReset();
    resolveKnowledgeSearchModeMock.mockReset();
    isKnowledgeSearchErrorMock.mockReset();
    ingestWorkbookUploadMock.mockReset();
    getInstitutionalKnowledgeIngestServiceMock.mockReset();
    shouldUseAppDatabaseDevFallbackMock.mockReset();

    resolveKnowledgeSearchModeMock.mockImplementation((_query: string, mode: string) =>
      mode === "auto" ? "semantic" : mode
    );
    isKnowledgeSearchErrorMock.mockReturnValue(false);
    getInstitutionalKnowledgeIngestServiceMock.mockReturnValue({
      ingestWorkbookUpload: ingestWorkbookUploadMock,
    });
    shouldUseAppDatabaseDevFallbackMock.mockReturnValue(false);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns 401 for unauthenticated GET requests", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await GET(new NextRequest("http://localhost/api/knowledge?view=stats"));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for invalid search mode", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const res = await GET(
      new NextRequest("http://localhost/api/knowledge?view=search&q=test&mode=bogus")
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "mode must be one of: auto, exact, semantic",
    });
    expect(searchKnowledgeBaseMock).not.toHaveBeenCalled();
  });

  it("returns resolved mode and delegates semantic search", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    searchKnowledgeBaseMock.mockResolvedValue([{ id: "knowledge-1" }]);
    resolveKnowledgeSearchModeMock.mockReturnValue("semantic");

    const res = await GET(
      new NextRequest(
        "http://localhost/api/knowledge?view=search&q=find%20similar%20drainage%20issues&mode=auto&types=deal_memo&limit=3"
      )
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      mode: "semantic",
      results: [{ id: "knowledge-1" }],
    });
    expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
      ORG_ID,
      "find similar drainage issues",
      ["deal_memo"],
      3,
      "auto"
    );
  });

  it("returns stats by default view", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getKnowledgeStatsMock.mockResolvedValue({ total: 4, contentTypes: { deal_memo: 2 } });

    const res = await GET(new NextRequest("http://localhost/api/knowledge"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ total: 4, contentTypes: { deal_memo: 2 } });
    expect(getKnowledgeStatsMock).toHaveBeenCalledWith(ORG_ID);
  });

  it("returns recent entries filtered by type", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    getRecentEntriesMock.mockResolvedValue([{ id: "knowledge-1" }]);

    const res = await GET(
      new NextRequest("http://localhost/api/knowledge?view=recent&type=deal_memo&limit=7")
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ entries: [{ id: "knowledge-1" }] });
    expect(getRecentEntriesMock).toHaveBeenCalledWith(ORG_ID, 7, "deal_memo");
  });

  it("accepts the new long-term learning content types", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    searchKnowledgeBaseMock.mockResolvedValue([{ id: "skill-1" }]);
    getRecentEntriesMock.mockResolvedValue([{ id: "trace-1" }]);
    ingestKnowledgeMock.mockResolvedValue(["episode-1"]);

    const searchRes = await GET(
      new NextRequest(
        "http://localhost/api/knowledge?view=search&q=triage%20procedure&types=procedural_skill,episodic_summary"
      )
    );
    expect(searchRes.status).toBe(200);

    const recentRes = await GET(
      new NextRequest("http://localhost/api/knowledge?view=recent&type=trajectory_trace&limit=2")
    );
    expect(recentRes.status).toBe(200);
    expect(getRecentEntriesMock).toHaveBeenCalledWith(ORG_ID, 2, "trajectory_trace");

    const ingestRes = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({
          action: "ingest",
          contentType: "procedural_skill",
          sourceId: "skill:abc",
          contentText: "Skill body",
          metadata: { agentId: "finance" },
        }),
      })
    );
    expect(ingestRes.status).toBe(200);
    expect(ingestKnowledgeMock).toHaveBeenCalledWith(
      ORG_ID,
      "procedural_skill",
      "skill:abc",
      "Skill body",
      { agentId: "finance" }
    );
  });

  it("rejects invalid content-type filters", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const searchRes = await GET(
      new NextRequest("http://localhost/api/knowledge?view=search&q=test&types=bogus_type")
    );
    expect(searchRes.status).toBe(400);

    const recentRes = await GET(
      new NextRequest("http://localhost/api/knowledge?view=recent&type=bogus_type")
    );
    expect(recentRes.status).toBe(400);

    const ingestRes = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({
          action: "ingest",
          contentType: "bogus_type",
          sourceId: "x",
          contentText: "y",
        }),
      })
    );
    expect(ingestRes.status).toBe(400);
  });

  it("returns degraded recent results when app DB fallback is active", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    shouldUseAppDatabaseDevFallbackMock.mockReturnValue(true);

    const res = await GET(
      new NextRequest("http://localhost/api/knowledge?view=recent&type=deal_memo&limit=7")
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "Knowledge base is temporarily unavailable",
      degraded: true,
      entries: [],
    });
    expect(getRecentEntriesMock).not.toHaveBeenCalled();
  });

  it("maps knowledge search errors to their explicit status", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    const error = Object.assign(
      new Error("Semantic knowledge search is unavailable because Qdrant is not configured"),
      { status: 503 }
    );
    searchKnowledgeBaseMock.mockRejectedValue(error);
    isKnowledgeSearchErrorMock.mockImplementation((candidate: unknown) => candidate === error);

    const res = await GET(
      new NextRequest(
        "http://localhost/api/knowledge?view=search&q=find%20similar%20drainage%20issues&mode=semantic"
      )
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "Semantic knowledge search is unavailable because Qdrant is not configured",
    });
  });

  it("returns 400 for invalid ingest payloads", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const res = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "ingest", sourceId: "memo-1" }),
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "contentType, sourceId, and contentText are required",
    });
  });

  it("returns 400 for invalid ingest_workbook payloads", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const res = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "ingest_workbook", uploadId: "upload-1" }),
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "uploadId and dealId are required",
    });
    expect(ingestWorkbookUploadMock).not.toHaveBeenCalled();
  });

  it("deletes knowledge for the authenticated org", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    deleteKnowledgeMock.mockResolvedValue(2);

    const res = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "delete", sourceId: "memo-1" }),
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: 2 });
    expect(deleteKnowledgeMock).toHaveBeenCalledWith(ORG_ID, "memo-1");
  });

  it("returns 401 for unauthenticated POST requests", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "ingest_workbook" }),
      })
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({ error: "Unauthorized" });
    expect(ingestKnowledgeMock).not.toHaveBeenCalled();
    expect(ingestWorkbookUploadMock).not.toHaveBeenCalled();
  });

  it("ingests workbook uploads via the dedicated service", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    ingestWorkbookUploadMock.mockResolvedValue({
      uploadId: "upload-1",
      documentExtractionId: "extraction-1",
      sourceId: "deal-model:the-collective:upload-1",
      contentType: "document_extraction",
      summary: "Workbook summary",
      metadata: { assetType: "Flex Warehouse" },
      sheetNames: ["Dashboard"],
      artifact: {
        filename: "model.xlsx",
        contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        sizeBytes: 123,
        storageObjectKey: "org/deal/model.xlsx",
        sha256: "abc",
        uploadedByUserId: USER_ID,
        uploadedByEmail: "blake@example.com",
        uploadedAt: "2026-03-06T12:00:00.000Z",
      },
      knowledge: {
        collection: "institutional_knowledge",
        denseVectorName: "dense",
        chunks: 2,
        ids: ["chunk-1", "chunk-2"],
        exactVerified: true,
        semanticVerified: true,
        exactTopResult: null,
        semanticTopResult: null,
        semanticQuery: "flex warehouse underwriting financial model",
      },
    });

    const res = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({
          action: "ingest_workbook",
          uploadId: "upload-1",
          dealId: "deal-1",
        }),
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toMatchObject({
      uploadId: "upload-1",
      sourceId: "deal-model:the-collective:upload-1",
      knowledge: {
        chunks: 2,
        exactVerified: true,
        semanticVerified: true,
      },
    });
    expect(getInstitutionalKnowledgeIngestServiceMock).toHaveBeenCalledTimes(1);
    expect(ingestWorkbookUploadMock).toHaveBeenCalledWith("upload-1", "deal-1", ORG_ID);
  });

  it("rejects delete requests without sourceId", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const res = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "delete" }),
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "sourceId is required" });
    expect(deleteKnowledgeMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid POST actions", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const res = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({ action: "sync" }),
      })
    );

    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Invalid action. Use: ingest, ingest_workbook, delete",
    });
  });

  it("returns 500 when ingesting knowledge fails", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    ingestKnowledgeMock.mockRejectedValue(new Error("ingest failed"));

    const res = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({
          action: "ingest",
          contentType: "agent_analysis",
          sourceId: "workbook:v1",
          contentText: "Workbook summary",
        }),
      })
    );

    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({ error: "ingest failed" });
  });

  it("returns degraded ingest response when app DB fallback is active", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    shouldUseAppDatabaseDevFallbackMock.mockReturnValue(true);

    const res = await POST(
      new NextRequest("http://localhost/api/knowledge", {
        method: "POST",
        body: JSON.stringify({
          action: "ingest",
          contentType: "agent_analysis",
          sourceId: "workbook:v1",
          contentText: "Workbook summary",
        }),
      })
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "Knowledge base is temporarily unavailable",
      degraded: true,
    });
    expect(ingestKnowledgeMock).not.toHaveBeenCalled();
  });
});
