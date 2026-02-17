import { describe, expect, it } from "vitest";

import {
  hostedFileSearchTool,
  hostedWebSearchPreviewTool,
} from "../../../src/tools/hostedTools.js";
import {
  coordinatorTools,
  fileSearchTool,
  marketIntelTools,
  researchTools,
  webSearchPreviewTool,
} from "../../../src/tools/index.js";

describe("Phase 1 Tool Pack :: hostedTools", () => {
  it("[MATRIX:tool:hostedWebSearch][PACK:schema] exposes typed web search preview declaration", () => {
    expect(hostedWebSearchPreviewTool.type).toBe("web_search_preview");
    expect(hostedWebSearchPreviewTool.search_context_size).toBe("medium");
  });

  it("[MATRIX:tool:hostedFileSearch][PACK:schema] exposes file search declaration for vector-store wiring", () => {
    expect(hostedFileSearchTool.type).toBe("file_search");
  });

  it("[MATRIX:tool:hostedWebSearch][PACK:wiring] reuses shared hosted tool declaration across E3 agent toolsets", () => {
    expect(webSearchPreviewTool).toBe(hostedWebSearchPreviewTool);
    expect(coordinatorTools).toContain(webSearchPreviewTool);
    expect(researchTools).toContain(webSearchPreviewTool);
    expect(marketIntelTools).toContain(webSearchPreviewTool);
  });

  it("[MATRIX:tool:hostedFileSearch][PACK:wiring] re-exports shared file search declaration", () => {
    expect(fileSearchTool).toBe(hostedFileSearchTool);
  });
});
