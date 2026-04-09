import { describe, expect, it, vi } from "vitest";

import {
  ResilientToolExecutor,
  type ResilientToolConfig,
} from "./resilientToolWrapper.js";

describe("ResilientToolExecutor", () => {
  it("returns data without fallbacks when primary execution succeeds", async () => {
    const execute = vi.fn().mockResolvedValue("ok");
    const config: ResilientToolConfig<[string], string> = {
      name: "sample-tool",
      execute,
      retry: {
        maxRetries: 0,
        backoffMs: 1,
        maxBackoffMs: 1,
        retryablePatterns: ["timeout"],
      },
      onFailure: "ASK_USER",
    };

    const executor = new ResilientToolExecutor();
    const result = await executor.execute(config, "input");

    expect(result).toEqual({
      success: true,
      data: "ok",
      fallbackUsed: false,
      warnings: [],
    });
    expect(execute).toHaveBeenCalledOnce();
    expect(execute).toHaveBeenCalledWith("input");
  });

  it("returns partial failure details when primary and fallback execution fail", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("fatal upstream failure"));
    const fallbackExecute = vi
      .fn()
      .mockRejectedValue(new Error("backup unavailable"));
    const config: ResilientToolConfig<[string], string> = {
      name: "sample-tool",
      execute,
      retry: {
        maxRetries: 0,
        backoffMs: 1,
        maxBackoffMs: 1,
        retryablePatterns: ["timeout"],
      },
      fallback: {
        fallbackExecute,
      },
      onFailure: "RETURN_PARTIAL",
    };

    const executor = new ResilientToolExecutor();
    const result = await executor.execute(config, "input");

    expect(result.success).toBe(false);
    expect(result.fallbackUsed).toBe(true);
    expect(result.data).toBeUndefined();
    expect(result.error).toBeInstanceOf(Error);
    expect(result.error?.message).toContain(
      "Resilient execution failed for sample-tool",
    );
    expect(result.warnings).toEqual([
      "Primary sample-tool execution failed: fatal upstream failure",
      "Fallback failed: backup unavailable",
    ]);
    expect(execute).toHaveBeenCalledOnce();
    expect(fallbackExecute).toHaveBeenCalledOnce();
    expect(fallbackExecute).toHaveBeenCalledWith("input");
  });
});
