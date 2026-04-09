import { describe, expect, it } from "vitest";
import {
  DATA_AGENT_RETRIEVAL_LIMIT,
  extractRequestedParish,
  isMaterialAddressMismatch,
  isParishScopedParcelRequest,
  normalizeOpenAiConversationId,
  shouldRequireAddressMemoryLookup,
  shouldRequireStoreMemory,
  shouldTreatAsKnowledgeIngestionOnly,
  shouldTreatAsMemoryIngestionOnly,
} from "../src/agent-runtime-heuristics";

describe("agent runtime heuristics", () => {
  it("keeps the retrieval limit stable", () => {
    expect(DATA_AGENT_RETRIEVAL_LIMIT).toBe(6);
  });

  it("detects property data that should be stored as memory", () => {
    expect(
      shouldRequireStoreMemory("123 Main St sold for $1,250,000 at a 6.1% cap rate."),
    ).toBe(true);
    expect(shouldRequireStoreMemory("What do we know about 123 Main St?")).toBe(false);
  });

  it("distinguishes address recall from ingestion-only prompts", () => {
    expect(shouldRequireAddressMemoryLookup("What do we know about 123 Main St?")).toBe(true);
    expect(
      shouldTreatAsMemoryIngestionOnly(
        "Store 123 Main St sold for $1,250,000 for future reference in the knowledge base.",
      ),
    ).toBe(true);
    expect(
      shouldTreatAsKnowledgeIngestionOnly(
        "Capture this reasoning trace for later institutional knowledge reference.",
      ),
    ).toBe(true);
  });

  it("normalizes OpenAI conversation ids", () => {
    expect(normalizeOpenAiConversationId("conv_123")).toBe("conv_123");
    expect(normalizeOpenAiConversationId("thread_123")).toBeUndefined();
  });

  it("extracts parish names and land-search scoping", () => {
    expect(extractRequestedParish("Show me parcels in east baton rouge parish")).toBe(
      "East Baton Rouge",
    );
    expect(
      isParishScopedParcelRequest(
        "Show me parcels in east baton rouge parish",
        "land_search",
      ),
    ).toBe(true);
    expect(
      isParishScopedParcelRequest(
        "Show me parcels in east baton rouge parish",
        "deal_analysis",
      ),
    ).toBe(false);
  });

  it("flags material address mismatches", () => {
    expect(
      isMaterialAddressMismatch("123 Main St, Baton Rouge, LA", "999 Main St, Baton Rouge, LA"),
    ).toBe(true);
    expect(
      isMaterialAddressMismatch(
        "123 Main Street, Baton Rouge, LA",
        "123 Main St Baton Rouge LA 70801",
      ),
    ).toBe(false);
  });
});
