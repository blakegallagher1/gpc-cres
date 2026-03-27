import { describe, it, expect } from "vitest";
import {
  TOOL_NAMESPACES,
  getToolNamespace,
  getDeferredToolNames,
  getAlwaysLoadedToolNames,
} from "../toolNamespaces";

describe("toolNamespaces", () => {
  describe("getToolNamespace", () => {
    it("returns correct namespace for known tool", () => {
      const ns = getToolNamespace("search_parcels");
      expect(ns).toBeDefined();
      expect(ns?.name).toBe("property");
      expect(ns?.description).toContain("Property database");
    });

    it("returns null for unknown tool", () => {
      const ns = getToolNamespace("unknown_tool");
      expect(ns).toBeNull();
    });

    it("finds tools in multiple namespaces correctly", () => {
      expect(getToolNamespace("search_knowledge_base")?.name).toBe("memory");
      expect(getToolNamespace("screen_flood")?.name).toBe("screening");
      expect(getToolNamespace("create_deal")?.name).toBe("deal");
      expect(getToolNamespace("generate_artifact")?.name).toBe("documents");
    });
  });

  describe("getDeferredToolNames", () => {
    it("returns tools from deferred namespaces only", () => {
      const deferred = getDeferredToolNames();
      expect(deferred).toContain("screen_flood");
      expect(deferred).toContain("screen_soils"); // screening namespace is deferred
      expect(deferred).toContain("browser_task");
      expect(deferred).toContain("calculate_proforma");
    });

    it("excludes tools from non-deferred namespaces", () => {
      const deferred = getDeferredToolNames();
      expect(deferred).not.toContain("search_parcels");
      expect(deferred).not.toContain("screen_batch"); // property namespace is not deferred
      expect(deferred).not.toContain("create_deal");
      expect(deferred).not.toContain("search_knowledge_base");
    });
  });

  describe("getAlwaysLoadedToolNames", () => {
    it("returns tools from non-deferred namespaces only", () => {
      const always = getAlwaysLoadedToolNames();
      expect(always).toContain("search_parcels");
      expect(always).toContain("create_deal");
      expect(always).toContain("search_knowledge_base");
    });

    it("excludes tools from deferred namespaces", () => {
      const always = getAlwaysLoadedToolNames();
      expect(always).not.toContain("screen_flood");
      expect(always).not.toContain("browser_task");
      expect(always).not.toContain("calculate_proforma");
    });
  });

  describe("namespace integrity", () => {
    it("no tool appears in multiple namespaces", () => {
      const allTools = TOOL_NAMESPACES.flatMap((ns) => ns.tools);
      const uniqueTools = new Set(allTools);
      expect(allTools.length).toBe(uniqueTools.size);
    });

    it("every namespace has at least one tool", () => {
      TOOL_NAMESPACES.forEach((ns) => {
        expect(ns.tools.length).toBeGreaterThan(0);
        expect(ns.name).toBeTruthy();
        expect(ns.description).toBeTruthy();
        expect(typeof ns.deferLoading).toBe("boolean");
      });
    });

    it("all tool names follow snake_case convention", () => {
      const allTools = TOOL_NAMESPACES.flatMap((ns) => ns.tools);
      allTools.forEach((tool) => {
        expect(tool).toMatch(/^[a-z_]+$/);
      });
    });

    it("deferLoading flag is set consistently by namespace type", () => {
      const deferredNs = TOOL_NAMESPACES.filter((ns) => ns.deferLoading);
      const alwaysNs = TOOL_NAMESPACES.filter((ns) => !ns.deferLoading);

      expect(deferredNs.map((ns) => ns.name)).toEqual([
        "screening",
        "documents",
        "browser",
        "financial",
      ]);

      expect(alwaysNs.map((ns) => ns.name)).toEqual([
        "property",
        "deal",
        "memory",
      ]);
    });
  });

  describe("exports", () => {
    it("TOOL_NAMESPACES is not empty", () => {
      expect(TOOL_NAMESPACES.length).toBeGreaterThan(0);
    });

    it("getDeferredToolNames returns an array", () => {
      const deferred = getDeferredToolNames();
      expect(Array.isArray(deferred)).toBe(true);
    });

    it("getAlwaysLoadedToolNames returns an array", () => {
      const always = getAlwaysLoadedToolNames();
      expect(Array.isArray(always)).toBe(true);
    });

    it("combined tools from both lists matches all tools", () => {
      const deferred = getDeferredToolNames();
      const always = getAlwaysLoadedToolNames();
      const combined = [...deferred, ...always];
      const allTools = TOOL_NAMESPACES.flatMap((ns) => ns.tools);

      expect(combined.sort()).toEqual(allTools.sort());
    });
  });
});
