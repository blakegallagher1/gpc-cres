import { describe, it, expect } from "vitest";
import {
  formatToolError,
  hasCustomFormatter,
  type ToolErrorFormatter,
} from "../toolErrorFormatters";

describe("toolErrorFormatters", () => {
  describe("formatToolError", () => {
    it("returns recovery message for browser_task", () => {
      const error = new Error("Connection timeout");
      const result = formatToolError("browser_task", error);

      expect(result).toContain("Browser automation service");
      expect(result).toContain("temporarily unavailable");
      expect(result).toContain("search_knowledge_base");
      expect(result).toContain("search_parcels");
    });

    it("returns recovery message for search_parcels", () => {
      const error = new Error("Gateway unavailable");
      const result = formatToolError("search_parcels", error);

      expect(result).toContain("Property database didn't respond");
      expect(result).toContain("recall_property_intelligence");
    });

    it("returns recovery message for screen_batch with error message", () => {
      const error = new Error("Partial timeout on 3 parcels");
      const result = formatToolError("screen_batch", error);

      expect(result).toContain("Batch screening partially failed");
      expect(result).toContain("Partial timeout on 3 parcels");
      expect(result).toContain("individual parcels");
    });

    it("returns recovery message for get_parcel_details", () => {
      const error = new Error("404 Not Found");
      const result = formatToolError("get_parcel_details", error);

      expect(result).toContain("Could not fetch parcel details");
      expect(result).toContain("search_knowledge_base");
    });

    it("returns recovery message for query_property_db_sql", () => {
      const error = new Error("Query timeout after 30s");
      const result = formatToolError("query_property_db_sql", error);

      expect(result).toContain("SQL query");
      expect(result).toContain("timed out");
      expect(result).toContain("Simplify the query");
    });

    it("returns recovery message for search_knowledge_base", () => {
      const error = new Error("Index unavailable");
      const result = formatToolError("search_knowledge_base", error);

      expect(result).toContain("Knowledge base search failed");
      expect(result).toContain("rephras");
    });

    it("returns recovery message for store_knowledge_entry", () => {
      const error = new Error("Write conflict");
      const result = formatToolError("store_knowledge_entry", error);

      expect(result).toContain("Could not save to knowledge base");
      expect(result).toContain("still available");
      expect(result).toContain("try storing it again");
    });

    it("returns recovery message for recall_property_intelligence", () => {
      const error = new Error("Vector DB offline");
      const result = formatToolError("recall_property_intelligence", error);

      expect(result).toContain("Property intelligence recall failed");
      expect(result).toContain("search_parcels");
      expect(result).toContain("search_knowledge_base");
    });

    it("returns recovery message for generate_artifact", () => {
      const error = new Error("Missing required field: lease_terms");
      const result = formatToolError("generate_artifact", error);

      expect(result).toContain("Artifact generation failed");
      expect(result).toContain("Missing required field");
      expect(result).toContain("Check that all required data");
    });

    it("returns default message for unknown tools", () => {
      const error = new Error("Some error");
      const result = formatToolError("unknown_tool", error);

      expect(result).toContain("Tool encountered an error");
      expect(result).toContain("Some error");
      expect(result).toContain("Try an alternative approach");
    });

    it("default formatter includes the error message", () => {
      const errorMsg = "Database connection refused";
      const error = new Error(errorMsg);
      const result = formatToolError("completely_unknown_tool", error);

      expect(result).toContain(errorMsg);
    });
  });

  describe("hasCustomFormatter", () => {
    it("returns true for browser_task", () => {
      expect(hasCustomFormatter("browser_task")).toBe(true);
    });

    it("returns true for search_parcels", () => {
      expect(hasCustomFormatter("search_parcels")).toBe(true);
    });

    it("returns true for screen_batch", () => {
      expect(hasCustomFormatter("screen_batch")).toBe(true);
    });

    it("returns true for get_parcel_details", () => {
      expect(hasCustomFormatter("get_parcel_details")).toBe(true);
    });

    it("returns true for query_property_db_sql", () => {
      expect(hasCustomFormatter("query_property_db_sql")).toBe(true);
    });

    it("returns true for search_knowledge_base", () => {
      expect(hasCustomFormatter("search_knowledge_base")).toBe(true);
    });

    it("returns true for store_knowledge_entry", () => {
      expect(hasCustomFormatter("store_knowledge_entry")).toBe(true);
    });

    it("returns true for recall_property_intelligence", () => {
      expect(hasCustomFormatter("recall_property_intelligence")).toBe(true);
    });

    it("returns true for generate_artifact", () => {
      expect(hasCustomFormatter("generate_artifact")).toBe(true);
    });

    it("returns false for unknown tools", () => {
      expect(hasCustomFormatter("unknown_tool")).toBe(false);
    });

    it("returns false for empty string", () => {
      expect(hasCustomFormatter("")).toBe(false);
    });
  });

  describe("formatter output properties", () => {
    it("all formatters return non-empty strings", () => {
      const toolNames = [
        "browser_task",
        "search_parcels",
        "get_parcel_details",
        "screen_batch",
        "query_property_db_sql",
        "search_knowledge_base",
        "store_knowledge_entry",
        "recall_property_intelligence",
        "generate_artifact",
      ];

      const testError = new Error("Test error");

      for (const toolName of toolNames) {
        const result = formatToolError(toolName, testError);
        expect(result).toBeTruthy();
        expect(result.length).toBeGreaterThan(0);
      }
    });

    it("formatters suggest alternative tools where applicable", () => {
      const testError = new Error("Test");

      // browser_task suggests alternatives
      const browserResult = formatToolError("browser_task", testError);
      expect(
        browserResult.includes("search_knowledge_base") ||
          browserResult.includes("search_parcels")
      ).toBe(true);

      // search_parcels suggests recall_property_intelligence
      const searchResult = formatToolError("search_parcels", testError);
      expect(searchResult).toContain("recall_property_intelligence");

      // get_parcel_details suggests search_knowledge_base
      const detailsResult = formatToolError("get_parcel_details", testError);
      expect(detailsResult).toContain("search_knowledge_base");

      // screen_batch suggests reducing batch size
      const batchResult = formatToolError("screen_batch", testError);
      expect(batchResult).toContain("individual");
    });
  });
});
