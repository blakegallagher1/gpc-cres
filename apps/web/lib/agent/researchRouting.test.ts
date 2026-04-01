import { describe, expect, it } from "vitest";

import {
  buildResearchRoutingMessage,
  inferResearchLane,
} from "./researchRouting";

describe("researchRouting", () => {
  it("defaults property and knowledge questions to local evidence first", () => {
    expect(
      inferResearchLane("What do we already know about 123 Main St and its zoning?"),
    ).toBe("local_first");
  });

  it("routes public current-events research to Perplexity", () => {
    expect(
      inferResearchLane("Find recent Baton Rouge zoning updates and cite sources."),
    ).toBe("public_web");
  });

  it("routes interactive navigation tasks to browser automation", () => {
    expect(
      inferResearchLane("Log in to the assessor portal, click parcel search, and extract the owner."),
    ).toBe("interactive_browser");
  });

  it("builds a routing contract with a lane-specific recommendation", () => {
    const message = buildResearchRoutingMessage(
      "Find recent Louisiana permitting news and cite the source.",
    );

    expect(message).toContain("RESEARCH ROUTING CONTRACT");
    expect(message).toContain("1. Local evidence first");
    expect(message).toContain("2. Public web research");
    expect(message).toContain("3. Interactive browser work");
    expect(message).toContain("This request appears to need public web research.");
  });
});
