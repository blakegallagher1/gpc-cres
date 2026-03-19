import { describe, expect, it } from "vitest";

import { WEB_ADDITIONAL_TOOL_ALLOWLIST, filterToolsForIntent } from "./toolPolicy.js";

describe("toolPolicy", () => {
  it("exposes store_knowledge_entry to the web chat allowlist", () => {
    const tools = [
      { type: "function", name: "store_knowledge_entry" },
      { type: "function", name: "store_memory" },
      { type: "function", name: "consult_finance_specialist" },
    ];

    const filtered = filterToolsForIntent("acquisition_underwriting", tools, {
      additionalAllowedTools: [...WEB_ADDITIONAL_TOOL_ALLOWLIST],
      allowFallback: false,
      allowNamelessTools: false,
    }) as Array<{ name?: string }>;

    expect(filtered.map((tool) => tool.name)).toEqual([
      "store_knowledge_entry",
      "store_memory",
      "consult_finance_specialist",
    ]);
  });

  it("allows parcel DB query tools for land search without exposing org SQL by default", () => {
    const tools = [
      { type: "function", name: "query_property_db" },
      { type: "function", name: "query_property_db_sql" },
      { type: "function", name: "query_org_sql" },
      { type: "function", name: "search_parcels" },
    ];

    const filtered = filterToolsForIntent("land_search", tools, {
      allowFallback: false,
      allowNamelessTools: false,
    }) as Array<{ name?: string }>;

    expect(filtered.map((tool) => tool.name)).toEqual([
      "query_property_db",
      "query_property_db_sql",
      "search_parcels",
    ]);
  });

  it("keeps org SQL available for research where org-scoped analytics are expected", () => {
    const tools = [
      { type: "function", name: "query_property_db" },
      { type: "function", name: "query_org_sql" },
      { type: "function", name: "search_knowledge_base" },
      { type: "function", name: "search_procedural_skills" },
      { type: "function", name: "search_similar_episodes" },
    ];

    const filtered = filterToolsForIntent("research", tools, {
      allowFallback: false,
      allowNamelessTools: false,
    }) as Array<{ name?: string }>;

    expect(filtered.map((tool) => tool.name)).toEqual([
      "query_property_db",
      "query_org_sql",
      "search_knowledge_base",
      "search_procedural_skills",
      "search_similar_episodes",
    ]);
  });
});
