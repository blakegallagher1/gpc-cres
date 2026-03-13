import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  resolveAuthMock,
  localToolMock,
  hostedToolMock,
  gatewayToolMock,
  mcpToolMock,
  shellWorkflowStubMock,
  resolveToolTransportMock,
  checkHostedToolQuotaMock,
  recordHostedToolUsageMock,
  getHostedToolUsageMock,
} = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  localToolMock: vi.fn(),
  hostedToolMock: vi.fn(),
  gatewayToolMock: vi.fn(),
  mcpToolMock: vi.fn(),
  shellWorkflowStubMock: vi.fn(),
  resolveToolTransportMock: vi.fn(),
  checkHostedToolQuotaMock: vi.fn(),
  recordHostedToolUsageMock: vi.fn(),
  getHostedToolUsageMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/agent/toolRegistry", () => ({
  toolRegistry: {
    local_tool: localToolMock,
    web_search_preview: hostedToolMock,
    search_parcels: gatewayToolMock,
    run_underwriting_workflow: shellWorkflowStubMock,
  },
}));

vi.mock("@entitlement-os/openai", () => ({
  resolveToolName: (name: string) =>
    name === "searchParcels" ? "search_parcels" : name,
  resolveToolCatalogEntry: (name: string) =>
    ({
      local_tool: {
        name: "local_tool",
        destination: "local",
        risk: "read",
        quotaClass: "unlimited",
        intents: ["general"],
      },
      web_search_preview: {
        name: "web_search_preview",
        destination: "hosted",
        risk: "read",
        quotaClass: "metered",
        intents: ["research"],
      },
      search_parcels: {
        name: "search_parcels",
        destination: "gateway",
        risk: "read",
        quotaClass: "unlimited",
        intents: ["research"],
      },
      gmaps_search_places: {
        name: "gmaps_search_places",
        destination: "mcp",
        risk: "read",
        quotaClass: "metered",
        intents: ["research"],
      },
      run_underwriting_workflow: {
        name: "run_underwriting_workflow",
        destination: "local",
        risk: "read",
        quotaClass: "unlimited",
        intents: ["finance"],
      },
    })[name],
  resolveToolTransport: resolveToolTransportMock,
  checkHostedToolQuota: checkHostedToolQuotaMock,
  recordHostedToolUsage: recordHostedToolUsageMock,
  getHostedToolUsage: getHostedToolUsageMock,
  TOOL_CATALOG: {
    local_tool: {
      name: "local_tool",
      destination: "local",
      risk: "read",
      quotaClass: "unlimited",
      intents: ["general"],
    },
    web_search_preview: {
      name: "web_search_preview",
      destination: "hosted",
      risk: "read",
      quotaClass: "metered",
      intents: ["research"],
    },
    search_parcels: {
      name: "search_parcels",
      destination: "gateway",
      risk: "read",
      quotaClass: "unlimited",
      intents: ["research"],
    },
    gmaps_search_places: {
      name: "gmaps_search_places",
      destination: "mcp",
      risk: "read",
      quotaClass: "metered",
      intents: ["research"],
    },
    run_underwriting_workflow: {
      name: "run_underwriting_workflow",
      destination: "local",
      risk: "read",
      quotaClass: "unlimited",
      intents: ["finance"],
    },
  },
}));

import { POST } from "./route.ts";

const ORG_ID = "11111111-1111-4111-8111-111111111111";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const CONVERSATION_ID = "conv-1";
const RUN_ID = "run-1";

const apiUrl = "http://localhost/api/agent/tools/execute";

function reqWithBody(body: unknown) {
  return new NextRequest(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/agent/tools/execute", () => {
  beforeEach(() => {
    resolveAuthMock.mockReset();
    localToolMock.mockReset();
    hostedToolMock.mockReset();
    gatewayToolMock.mockReset();
    mcpToolMock.mockReset();
    shellWorkflowStubMock.mockReset();
    resolveToolTransportMock.mockReset();
    checkHostedToolQuotaMock.mockReset();
    recordHostedToolUsageMock.mockReset();
    getHostedToolUsageMock.mockReset();
  });

  it("returns 401 when user is not authenticated", async () => {
    resolveAuthMock.mockResolvedValue(null);

    const res = await POST(reqWithBody({ toolName: "local_tool", arguments: {} }));
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body).toEqual({ error: "Unauthorized" });
    expect(localToolMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid JSON payload", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const req = new NextRequest(apiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{bad-json",
    });

    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Invalid JSON body" });
    expect(localToolMock).not.toHaveBeenCalled();
  });

  it("accepts legacy payload shape with `tool` and top-level arguments", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    localToolMock.mockResolvedValue({ ok: true, value: "legacy-ok" });

    const res = await POST(
      reqWithBody({
        tool: "local_tool",
        include: true,
        conversationId: CONVERSATION_ID,
        runId: RUN_ID,
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(localToolMock).toHaveBeenCalledWith(
      { include: true },
      {
        orgId: ORG_ID,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        dealId: undefined,
      },
    );
    expect(body).toMatchObject({
      result: { ok: true, value: "legacy-ok" },
      metadata: {
        toolName: "local_tool",
        name: "local_tool",
        destination: "local",
        conversationId: CONVERSATION_ID,
        runId: RUN_ID,
      },
    });
  });

  it("accepts top-level context fields when `context` object is omitted", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    localToolMock.mockResolvedValue({ ok: true, value: 456 });

    const res = await POST(
      reqWithBody({
        toolName: "local_tool",
        arguments: { include: true },
        conversationId: CONVERSATION_ID,
        dealId: "deal-42",
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(localToolMock).toHaveBeenCalledWith(
      { include: true },
      {
        orgId: ORG_ID,
        userId: USER_ID,
        conversationId: CONVERSATION_ID,
        dealId: "deal-42",
      },
    );
    expect(body.metadata.conversationId).toBe(CONVERSATION_ID);
  });

  it("returns 400 for missing toolName", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const res = await POST(reqWithBody({ arguments: {} }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(body.details.toolName[0]).toContain("string");
    expect(localToolMock).not.toHaveBeenCalled();
  });

  it("returns 400 when arguments is invalid", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const res = await POST(reqWithBody({ toolName: "local_tool", arguments: "not-an-object" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Validation failed");
    expect(body.details.arguments).toBeDefined();
    expect(localToolMock).not.toHaveBeenCalled();
  });

  it("returns 400 for unknown tool", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });

    const res = await POST(reqWithBody({ toolName: "does_not_exist", arguments: {} }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toEqual({ error: "Unknown tool: does_not_exist" });
  });

  it("enforces hosted tool context by requiring conversationId", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    checkHostedToolQuotaMock.mockReturnValue({ allowed: true });
    getHostedToolUsageMock.mockReturnValue(0);
    hostedToolMock.mockResolvedValue({ hits: 3, items: ["a", "b", "c"] });

    const res = await POST(
      reqWithBody({
        toolName: "web_search_preview",
        arguments: { query: "entitlement" },
        context: {},
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/conversationId/i);
    expect(checkHostedToolQuotaMock).not.toHaveBeenCalled();
    expect(hostedToolMock).not.toHaveBeenCalled();
  });

  it("enforces hosted-tool quota for metered tools", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    checkHostedToolQuotaMock.mockReturnValue({
      allowed: false,
      reason: "Hosted tool web_search_preview quota exceeded",
    });
    getHostedToolUsageMock.mockReturnValue(11);

    const res = await POST(
      reqWithBody({
        toolName: "web_search_preview",
        arguments: { query: "recent entitlements" },
        context: { conversationId: CONVERSATION_ID },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(429);
    expect(body).toMatchObject({
      error: expect.stringContaining("quota"),
    });
    expect(checkHostedToolQuotaMock).toHaveBeenCalledWith(
      CONVERSATION_ID,
      "web_search_preview",
    );
    expect(hostedToolMock).not.toHaveBeenCalled();
    expect(recordHostedToolUsageMock).not.toHaveBeenCalled();
  });

  it("checks transport policy for non-hosted tools", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    localToolMock.mockResolvedValue({ ok: true, value: 123 });

    const res = await POST(
      reqWithBody({
        toolName: "local_tool",
        arguments: { include: true },
        context: { conversationId: CONVERSATION_ID, runId: RUN_ID },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(resolveToolTransportMock).not.toHaveBeenCalled();
    expect(body).toMatchObject({
      result: { ok: true, value: 123 },
      metadata: {
        toolName: "local_tool",
        name: "local_tool",
        conversationId: CONVERSATION_ID,
        runId: RUN_ID,
        destination: "local",
        transport: "direct",
        risk: "read",
        quotaClass: "unlimited",
      },
    });
  });

  it("returns success payload with execution metadata for hosted calls", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    checkHostedToolQuotaMock.mockReturnValue({ allowed: true });
    hostedToolMock.mockResolvedValue({ hits: 3, items: ["a", "b", "c"] });
    getHostedToolUsageMock.mockReturnValue(1);

    const res = await POST(
      reqWithBody({
        toolName: "web_search_preview",
        arguments: { query: "permitted use" },
        context: { conversationId: CONVERSATION_ID, runId: RUN_ID },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(checkHostedToolQuotaMock).toHaveBeenCalledWith(
      CONVERSATION_ID,
      "web_search_preview",
    );
    expect(recordHostedToolUsageMock).toHaveBeenCalledWith(
      CONVERSATION_ID,
      "web_search_preview",
    );
    expect(body).toMatchObject({
      result: {
        hits: 3,
        items: ["a", "b", "c"],
      },
      metadata: {
        toolName: "web_search_preview",
        name: "web_search_preview",
        conversationId: CONVERSATION_ID,
        runId: RUN_ID,
        destination: "hosted",
        transport: "direct",
        risk: "read",
        quotaClass: "metered",
        usage: {
          conversationId: CONVERSATION_ID,
          current: 1,
        },
      },
    });
  });

  it("resolves gateway tool transport via MCP path", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    resolveToolTransportMock.mockReturnValue("mcp");
    gatewayToolMock.mockResolvedValue({ parcels: ["p-1"] });

    const res = await POST(
      reqWithBody({
        toolName: "searchParcels",
        arguments: { query: "308-4646-1" },
        context: { conversationId: CONVERSATION_ID },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(resolveToolTransportMock).toHaveBeenCalledWith("search_parcels");
    expect(body).toMatchObject({
      result: {
        parcels: ["p-1"],
      },
      metadata: {
        requestedToolName: "searchParcels",
        toolName: "search_parcels",
        name: "search_parcels",
        destination: "gateway",
        transport: "mcp",
        risk: "read",
        quotaClass: "unlimited",
        conversationId: CONVERSATION_ID,
      },
    });
  });

  it("returns 400 when transport resolver fails for a gateway tool", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    resolveToolTransportMock.mockImplementation(() => {
      throw new Error("Tool transport policy missing");
    });
    localToolMock.mockResolvedValue({ ok: true });

    const res = await POST(
      reqWithBody({
        toolName: "searchParcels",
        arguments: { parcelId: "308-4646-1" },
        context: { conversationId: CONVERSATION_ID },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body).toMatchObject({
      error: expect.stringMatching(/transport/i),
    });
    expect(gatewayToolMock).not.toHaveBeenCalled();
  });

  it("returns 400 for MCP tools because they execute via OpenAI, not the Vercel executor", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    resolveToolTransportMock.mockReturnValue("mcp");

    const res = await POST(
      reqWithBody({
        toolName: "gmaps_search_places",
        arguments: { query: "coffee near Baton Rouge" },
        context: { conversationId: CONVERSATION_ID },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(resolveToolTransportMock).toHaveBeenCalledWith("gmaps_search_places");
    expect(body).toMatchObject({
      error: expect.stringContaining("MCP tool"),
      metadata: {
        toolName: "gmaps_search_places",
        destination: "mcp",
        transport: "mcp",
        quotaClass: "metered",
      },
    });
  });

  it("shell workflow stub returns unsupported_environment error gracefully", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    shellWorkflowStubMock.mockResolvedValue({
      error: "Tool 'run_underwriting_workflow' requires the local compute environment and cannot run in serverless. Route to the gateway instead.",
      status: "unsupported_environment",
    });

    const res = await POST(
      reqWithBody({
        toolName: "run_underwriting_workflow",
        arguments: { noi: 100000 },
        context: { conversationId: CONVERSATION_ID },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.result).toMatchObject({
      error: expect.stringContaining("local compute environment"),
      status: "unsupported_environment",
    });
    expect(body.metadata.toolName).toBe("run_underwriting_workflow");
    expect(body.metadata.destination).toBe("local");
  });

  it("returns 500 when resolveAuth throws an exception", async () => {
    resolveAuthMock.mockRejectedValue(new Error("JWT decode failed"));

    const res = await POST(
      reqWithBody({
        toolName: "local_tool",
        arguments: {},
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toMatch(/JWT decode failed/i);
    expect(localToolMock).not.toHaveBeenCalled();
  });

  it("returns 500 with error message when tool execution throws", async () => {
    resolveAuthMock.mockResolvedValue({ userId: USER_ID, orgId: ORG_ID });
    localToolMock.mockRejectedValue(new Error("Database connection failed"));

    const res = await POST(
      reqWithBody({
        toolName: "local_tool",
        arguments: {},
        context: { conversationId: CONVERSATION_ID },
      }),
    );
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.error).toBe("Database connection failed");
    expect(body.metadata.toolName).toBe("local_tool");
  });
});
