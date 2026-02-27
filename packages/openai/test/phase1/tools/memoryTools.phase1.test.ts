import { describe, expect, it } from "vitest";

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
});
