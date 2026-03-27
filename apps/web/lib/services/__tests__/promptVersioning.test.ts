import { describe, it, expect, beforeEach } from "vitest";
import {
  createPromptVersion,
  getActivePrompt,
  getPromptVersion,
  listPromptVersions,
  revertToVersion,
  updateQualityScore,
  getBestPerformingVersion,
  _clearAllVersions,
} from "../promptVersioning.service";

describe("promptVersioning.service", () => {
  beforeEach(() => {
    _clearAllVersions();
  });

  it("createPromptVersion increments version number", () => {
    const v1 = createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v1",
    });
    expect(v1.version).toBe(1);

    const v2 = createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v2",
    });
    expect(v2.version).toBe(2);

    const v3 = createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v3",
    });
    expect(v3.version).toBe(3);
  });

  it("createPromptVersion deactivates previous active version", () => {
    const v1 = createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v1",
    });
    expect(v1.isActive).toBe(true);

    const v2 = createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v2",
    });
    expect(v2.isActive).toBe(true);

    const retrievedV1 = getPromptVersion("agent-1", 1);
    expect(retrievedV1?.isActive).toBe(false);
  });

  it("getActivePrompt returns current active version", () => {
    createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v1",
    });
    const v2 = createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v2",
    });

    const active = getActivePrompt("agent-1");
    expect(active).not.toBeNull();
    expect(active?.version).toBe(2);
    expect(active?.content).toBe("System prompt v2");
  });

  it("getActivePrompt returns null for unknown agent", () => {
    const active = getActivePrompt("unknown-agent");
    expect(active).toBeNull();
  });

  it("revertToVersion activates target and deactivates others", () => {
    createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v1",
    });
    createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v2",
    });
    createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v3",
    });

    const reverted = revertToVersion("agent-1", 1);
    expect(reverted).not.toBeNull();
    expect(reverted?.version).toBe(1);
    expect(reverted?.isActive).toBe(true);

    const active = getActivePrompt("agent-1");
    expect(active?.version).toBe(1);

    const v2 = getPromptVersion("agent-1", 2);
    expect(v2?.isActive).toBe(false);

    const v3 = getPromptVersion("agent-1", 3);
    expect(v3?.isActive).toBe(false);
  });

  it("revertToVersion returns null for unknown version", () => {
    createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v1",
    });

    const reverted = revertToVersion("agent-1", 999);
    expect(reverted).toBeNull();
  });

  it("updateQualityScore sets score on correct version", () => {
    createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v1",
    });
    const v2 = createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v2",
    });

    expect(v2.qualityScore).toBeNull();

    const updated = updateQualityScore("agent-1", 2, 0.85);
    expect(updated).toBe(true);

    const retrieved = getPromptVersion("agent-1", 2);
    expect(retrieved?.qualityScore).toBe(0.85);
  });

  it("getBestPerformingVersion returns highest scored", () => {
    const v1 = createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v1",
    });
    const v2 = createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v2",
    });
    const v3 = createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v3",
    });

    updateQualityScore("agent-1", 1, 0.75);
    updateQualityScore("agent-1", 2, 0.92);
    updateQualityScore("agent-1", 3, 0.88);

    const best = getBestPerformingVersion("agent-1");
    expect(best).not.toBeNull();
    expect(best?.version).toBe(2);
    expect(best?.qualityScore).toBe(0.92);
  });

  it("listPromptVersions returns sorted by version desc", () => {
    createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v1",
    });
    createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v2",
    });
    createPromptVersion({
      agentId: "agent-1",
      content: "System prompt v3",
    });

    const versions = listPromptVersions("agent-1");
    expect(versions).toHaveLength(3);
    expect(versions[0].version).toBe(3);
    expect(versions[1].version).toBe(2);
    expect(versions[2].version).toBe(1);
  });
});
