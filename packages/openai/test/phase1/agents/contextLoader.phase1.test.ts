import { describe, expect, it, vi } from "vitest";
import { LazyContext } from "../../../src/agents/contextLoader.js";

describe("Phase 1 Agent Pack :: context loader", () => {
  it("[MATRIX:agent:context-loader][PACK:progressive] loads metadata/body/resources progressively and caches each tier", async () => {
    const metadataLoader = vi.fn(() => "metadata");
    const bodyLoader = vi.fn(() => "body");
    const resourcesLoader = vi.fn(() => "resources");

    const loader = new LazyContext({
      metadata: metadataLoader,
      body: bodyLoader,
      resources: resourcesLoader,
    });

    expect(loader.getState()).toEqual({
      metadataLoads: 0,
      bodyLoads: 0,
      resourceLoads: 0,
    });

    await loader.getMetadata();
    expect(loader.getState()).toEqual({
      metadataLoads: 1,
      bodyLoads: 0,
      resourceLoads: 0,
    });

    const composed = await loader.compose();
    expect(composed).toContain("metadata");
    expect(composed).toContain("body");
    expect(composed).toContain("resources");
    expect(loader.getState()).toEqual({
      metadataLoads: 1,
      bodyLoads: 1,
      resourceLoads: 1,
    });

    await loader.compose();
    expect(loader.getState()).toEqual({
      metadataLoads: 1,
      bodyLoads: 1,
      resourceLoads: 1,
    });
    expect(metadataLoader).toHaveBeenCalledTimes(1);
    expect(bodyLoader).toHaveBeenCalledTimes(1);
    expect(resourcesLoader).toHaveBeenCalledTimes(1);
  });
});
