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
});
