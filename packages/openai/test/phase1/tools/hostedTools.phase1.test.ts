import { describe, expect, it } from "vitest";

import {
  hostedFileSearchTool,
  hostedWebSearchPreviewTool,
} from "../../../src/tools/hostedTools.js";

describe("Phase 1 Tool Pack :: hostedTools", () => {
  it("[MATRIX:tool:hostedWebSearch][PACK:schema] exposes typed web search preview declaration", () => {
    expect(hostedWebSearchPreviewTool.type).toBe("web_search_preview");
    expect(hostedWebSearchPreviewTool.search_context_size).toBe("medium");
  });

  it("[MATRIX:tool:hostedFileSearch][PACK:schema] exposes file search declaration for vector-store wiring", () => {
    expect(hostedFileSearchTool.type).toBe("file_search");
  });
});
