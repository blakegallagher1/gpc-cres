import { describe, it, expect } from "vitest";
import {
  getToolTimeout,
  formatTimeoutError,
  TOOL_TIMEOUTS,
  type ToolTimeoutConfig,
} from "../toolTimeouts";

describe("toolTimeouts", () => {
  describe("getToolTimeout", () => {
    it("returns correct config for known tools", () => {
      const browserTaskConfig = getToolTimeout("browser_task");
      expect(browserTaskConfig).toEqual({
        timeoutMs: 120_000,
        errorStrategy: "error_as_result",
      });

      const searchParcelsConfig = getToolTimeout("search_parcels");
      expect(searchParcelsConfig).toEqual({
        timeoutMs: 15_000,
        errorStrategy: "error_as_result",
      });

      const screenBatchConfig = getToolTimeout("screen_batch");
      expect(screenBatchConfig).toEqual({
        timeoutMs: 60_000,
        errorStrategy: "error_as_result",
      });
    });

    it("returns default config for unknown tools", () => {
      const unknownToolConfig = getToolTimeout("nonexistent_tool");
      expect(unknownToolConfig).toEqual(TOOL_TIMEOUTS._default);
      expect(unknownToolConfig.timeoutMs).toBe(30_000);
      expect(unknownToolConfig.errorStrategy).toBe("error_as_result");
    });

    it("returns consistent config across multiple calls", () => {
      const config1 = getToolTimeout("search_parcels");
      const config2 = getToolTimeout("search_parcels");
      expect(config1).toEqual(config2);
    });
  });

  describe("formatTimeoutError", () => {
    it("produces readable error message for tool timeout", () => {
      const message = formatTimeoutError("browser_task", 120_000);
      expect(message).toBe(
        "Tool 'browser_task' timed out after 120s. Try a simpler query or check service health."
      );
    });

    it("correctly converts milliseconds to seconds", () => {
      const message = formatTimeoutError("search_parcels", 15_000);
      expect(message).toBe(
        "Tool 'search_parcels' timed out after 15s. Try a simpler query or check service health."
      );
    });

    it("handles sub-second timeouts", () => {
      const message = formatTimeoutError("test_tool", 500);
      expect(message).toBe(
        "Tool 'test_tool' timed out after 0.5s. Try a simpler query or check service health."
      );
    });
  });

  describe("TOOL_TIMEOUTS registry", () => {
    it("includes default timeout entry", () => {
      expect(TOOL_TIMEOUTS._default).toBeDefined();
    });

    it("all timeouts have valid config structure", () => {
      Object.entries(TOOL_TIMEOUTS).forEach(([toolName, config]) => {
        expect(config).toHaveProperty("timeoutMs");
        expect(config).toHaveProperty("errorStrategy");
        expect(typeof config.timeoutMs).toBe("number");
        expect(config.timeoutMs).toBeGreaterThan(0);
        expect(["error_as_result", "raise_exception"]).toContain(
          config.errorStrategy
        );
      });
    });

    it("has timeouts for critical tools", () => {
      const criticalTools = [
        "browser_task",
        "search_parcels",
        "get_parcel_details",
        "screen_batch",
        "query_property_db_sql",
      ];
      criticalTools.forEach((toolName) => {
        expect(TOOL_TIMEOUTS[toolName]).toBeDefined();
      });
    });
  });
});
