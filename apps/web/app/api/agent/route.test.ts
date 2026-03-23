import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { resolveAuthMock, runAgentWorkflowMock } = vi.hoisted(() => ({
  resolveAuthMock: vi.fn(),
  runAgentWorkflowMock: vi.fn(),
}));

vi.mock("@/lib/auth/resolveAuth", () => ({
  resolveAuth: resolveAuthMock,
}));

vi.mock("@/lib/agent/agentRunner", () => ({
  runAgentWorkflow: runAgentWorkflowMock,
}));

import { POST } from "./route";

describe("POST /api/agent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAuthMock.mockResolvedValue({
      orgId: "org-1",
      userId: "user-1",
    });
  });

  it("sanitizes gateway proxy errors in the SSE payload", async () => {
    runAgentWorkflowMock.mockRejectedValueOnce(
      new Error("Gateway DB proxy error (500): unable to parse request."),
    );

    const response = await POST(
      new NextRequest("http://localhost/api/agent", {
        method: "POST",
        body: JSON.stringify({ message: "Run underwriting" }),
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-1",
        },
      }),
    );

    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toContain('"type":"error"');
    expect(text).toContain('"code":"upstream_service_error"');
    expect(text).toContain(
      "The requested analysis could not start. Link a deal if this command is deal-specific, then try again.",
    );
    expect(text).not.toContain("Gateway DB proxy error");
  });
});
