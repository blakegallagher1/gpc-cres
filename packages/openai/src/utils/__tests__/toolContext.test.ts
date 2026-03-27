import { describe, it, expect } from "vitest";
import {
  extractToolContext,
  hasValidOrgContext,
  hasDealContext,
  type ToolExecutionContext,
} from "../toolContext";

describe("toolContext", () => {
  describe("extractToolContext", () => {
    it("extracts flat context", () => {
      const raw = {
        orgId: "org-123",
        userId: "user-456",
        conversationId: "conv-789",
        dealId: "deal-abc",
        jurisdictionId: "juris-def",
        runType: "async",
        preferredCuaModel: "gpt-5.4",
      };
      const ctx = extractToolContext(raw);
      expect(ctx.orgId).toBe("org-123");
      expect(ctx.userId).toBe("user-456");
      expect(ctx.conversationId).toBe("conv-789");
      expect(ctx.dealId).toBe("deal-abc");
      expect(ctx.jurisdictionId).toBe("juris-def");
      expect(ctx.runType).toBe("async");
      expect(ctx.preferredCuaModel).toBe("gpt-5.4");
    });

    it("extracts nested .context property", () => {
      const raw = {
        someOtherField: "ignored",
        context: {
          orgId: "org-nested",
          userId: "user-nested",
          conversationId: "conv-nested",
        },
      };
      const ctx = extractToolContext(raw);
      expect(ctx.orgId).toBe("org-nested");
      expect(ctx.userId).toBe("user-nested");
      expect(ctx.conversationId).toBe("conv-nested");
    });

    it("handles null/undefined gracefully", () => {
      const ctxNull = extractToolContext(null);
      const ctxUndefined = extractToolContext(undefined);
      const ctxEmpty = extractToolContext({});

      expect(ctxNull.orgId).toBe("");
      expect(ctxNull.userId).toBe("");
      expect(ctxNull.conversationId).toBeNull();

      expect(ctxUndefined.orgId).toBe("");
      expect(ctxUndefined.userId).toBe("");

      expect(ctxEmpty.orgId).toBe("");
      expect(ctxEmpty.userId).toBe("");
    });

    it("returns empty string for missing orgId", () => {
      const raw = { userId: "user-123" };
      const ctx = extractToolContext(raw);
      expect(ctx.orgId).toBe("");
    });

    it("ignores empty string values and treats them as null", () => {
      const raw = {
        orgId: "org-123",
        dealId: "",
        conversationId: "",
        preferredCuaModel: "",
      };
      const ctx = extractToolContext(raw);
      expect(ctx.orgId).toBe("org-123");
      expect(ctx.dealId).toBeNull();
      expect(ctx.conversationId).toBeNull();
      expect(ctx.preferredCuaModel).toBeNull();
    });

    it("extracts preferredCuaModel", () => {
      const raw = {
        orgId: "org-123",
        userId: "user-123",
        preferredCuaModel: "gpt-5.4-mini",
      };
      const ctx = extractToolContext(raw);
      expect(ctx.preferredCuaModel).toBe("gpt-5.4-mini");
    });
  });

  describe("hasValidOrgContext", () => {
    it("returns true with valid orgId", () => {
      const ctx: ToolExecutionContext = {
        orgId: "org-123",
        userId: "",
        conversationId: null,
        dealId: null,
        jurisdictionId: null,
        runType: null,
        preferredCuaModel: null,
      };
      expect(hasValidOrgContext(ctx)).toBe(true);
    });

    it("returns false with empty orgId", () => {
      const ctx: ToolExecutionContext = {
        orgId: "",
        userId: "user-123",
        conversationId: null,
        dealId: null,
        jurisdictionId: null,
        runType: null,
        preferredCuaModel: null,
      };
      expect(hasValidOrgContext(ctx)).toBe(false);
    });
  });

  describe("hasDealContext", () => {
    it("returns true with valid dealId", () => {
      const ctx: ToolExecutionContext = {
        orgId: "org-123",
        userId: "user-123",
        conversationId: null,
        dealId: "deal-abc",
        jurisdictionId: null,
        runType: null,
        preferredCuaModel: null,
      };
      expect(hasDealContext(ctx)).toBe(true);
    });

    it("returns false with null dealId", () => {
      const ctx: ToolExecutionContext = {
        orgId: "org-123",
        userId: "user-123",
        conversationId: null,
        dealId: null,
        jurisdictionId: null,
        runType: null,
        preferredCuaModel: null,
      };
      expect(hasDealContext(ctx)).toBe(false);
    });

    it("returns false with empty dealId", () => {
      const ctx: ToolExecutionContext = {
        orgId: "org-123",
        userId: "user-123",
        conversationId: null,
        dealId: "",
        jurisdictionId: null,
        runType: null,
        preferredCuaModel: null,
      };
      expect(hasDealContext(ctx)).toBe(false);
    });
  });
});
