import { describe, expect, it, vi } from "vitest";

import {
  get_entity_memory,
  get_entity_truth,
  record_memory_event,
  store_memory,
} from "../../../src/tools/memoryTools.js";
import { readRepoSource } from "../_helpers/toolAssertions.js";

describe("Phase 1 Tool Pack :: memoryTools", () => {
  it("exports all memory tools with expected names", () => {
    expect(record_memory_event.name).toBe("record_memory_event");
    expect(get_entity_memory.name).toBe("get_entity_memory");
    expect(store_memory.name).toBe("store_memory");
    expect(get_entity_truth.name).toBe("get_entity_truth");
  });

  it("attaches internal coordinator auth headers when auth context is present", () => {
    const source = readRepoSource("packages/openai/src/tools/memoryTools.ts");

    expect(source).toContain("function buildMemoryToolHeaders(context?: unknown)");
    expect(source).toContain("headers.Authorization = `Bearer ${token}`;");
    expect(source).toContain('headers["x-agent-tool-auth"] = "coordinator-memory"');
    expect(source).toContain("x-agent-org-id");
    expect(source).toContain("x-agent-user-id");
    expect(source).toContain("buildMemoryToolHeaders(context)");
  });

  it("ensures memory APIs are called with content-type and optional auth headers", () => {
    const source = readRepoSource("packages/openai/src/tools/memoryTools.ts");

    expect(source).toContain("/api/memory/events`");
    expect(source).toContain("/api/entities/${params.entity_id}/memory");
    expect(source).toContain("/api/memory/write`");
    expect(source).toContain("/api/entities/${params.entity_id}/truth");
  });

  it("sends coordinator auth headers when context includes orgId/userId and service token is set", async () => {
    const originalToken = process.env.MEMORY_TOOL_SERVICE_TOKEN;
    process.env.MEMORY_TOOL_SERVICE_TOKEN = "coordinator-service-token";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: vi.fn().mockResolvedValue("ok"),
      json: vi.fn().mockResolvedValue({
        decision: "verified",
        reasons: [],
        eventLogId: "evt-1",
        recordId: "rec-1",
        structuredMemoryWrite: {},
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { store_memory } = await import("../../../src/tools/memoryTools.js");
    const result = await (store_memory as { invoke: (runContext: unknown, input: string) => Promise<unknown> }).invoke(
      {
        orgId: "org-abc",
        userId: "user-xyz",
      },
      JSON.stringify({
        input_text: "123 Main sold for $1.2M",
        address: "123 Main",
        parcel_id: null,
        entity_id: null,
        entity_type: "property",
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const callUrl = fetchMock.mock.calls[0]?.[0];
    expect(callUrl).toContain("/api/memory/write");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "POST",
      headers: {
        Authorization: "Bearer coordinator-service-token",
        "x-agent-tool-auth": "coordinator-memory",
        "x-agent-org-id": "org-abc",
        "x-agent-user-id": "user-xyz",
      },
      body: expect.stringContaining("123 Main sold for $1.2M"),
    });
    expect(result).toEqual({
      stored: true,
      decision: "verified",
      reasons: [],
      eventLogId: "evt-1",
      recordId: "rec-1",
      structuredMemoryWrite: {},
    });

    if (originalToken === undefined) {
      delete process.env.MEMORY_TOOL_SERVICE_TOKEN;
    } else {
      process.env.MEMORY_TOOL_SERVICE_TOKEN = originalToken;
    }
  });

  it("accepts wrapped context object from RunContext.context and still sends auth headers", async () => {
    const originalPrimaryToken = process.env.MEMORY_TOOL_SERVICE_TOKEN;
    const originalToken = process.env.COORDINATOR_TOOL_SERVICE_TOKEN;
    delete process.env.MEMORY_TOOL_SERVICE_TOKEN;
    process.env.COORDINATOR_TOOL_SERVICE_TOKEN = "legacy-coordinator-key";

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      text: vi.fn().mockResolvedValue("ok"),
      json: vi.fn().mockResolvedValue({
        decision: "verified",
        reasons: ["ok"],
        eventLogId: "evt-2",
        recordId: "rec-2",
        structuredMemoryWrite: {},
      }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const { get_entity_truth } = await import("../../../src/tools/memoryTools.js");
    const result = await (get_entity_truth as { invoke: (runContext: unknown, input: string) => Promise<unknown> }).invoke(
      {
        context: { orgId: "org-bbb", userId: "user-abc" },
      },
      JSON.stringify({ entity_id: "entity-1" }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      headers: {
        Authorization: "Bearer legacy-coordinator-key",
        "x-agent-tool-auth": "coordinator-memory",
        "x-agent-org-id": "org-bbb",
        "x-agent-user-id": "user-abc",
      },
    });
    expect(result).toEqual({
      decision: "verified",
      reasons: ["ok"],
      eventLogId: "evt-2",
      recordId: "rec-2",
      structuredMemoryWrite: {},
    });

    if (originalToken === undefined) {
      delete process.env.COORDINATOR_TOOL_SERVICE_TOKEN;
    } else {
      process.env.COORDINATOR_TOOL_SERVICE_TOKEN = originalToken;
    }
    if (originalPrimaryToken === undefined) {
      delete process.env.MEMORY_TOOL_SERVICE_TOKEN;
    } else {
      process.env.MEMORY_TOOL_SERVICE_TOKEN = originalPrimaryToken;
    }
  });
});
