import { describe, it, expect } from "vitest";
import {
  buildSkillManifest,
  encodeSkillContent,
  buildInlineSkill,
  isSkillViable,
  type ProceduralSkillInput,
} from "../inlineSkillBuilder";

describe("inlineSkillBuilder", () => {
  describe("buildSkillManifest", () => {
    it("includes name in frontmatter", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "Test Description",
        strategy: "Test strategy",
      };

      const manifest = buildSkillManifest(skill);

      expect(manifest).toContain("---");
      expect(manifest).toContain("name: Test Skill");
      expect(manifest).toContain("description: Test Description");
    });

    it("includes strategy section when provided", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "Test Description",
        strategy: "This is my strategy\nWith multiple lines",
      };

      const manifest = buildSkillManifest(skill);

      expect(manifest).toContain("## Strategy");
      expect(manifest).toContain("This is my strategy");
      expect(manifest).toContain("With multiple lines");
    });

    it("includes tool sequence as numbered list", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "Test Description",
        toolSequence: ["tool_a", "tool_b", "tool_c"],
      };

      const manifest = buildSkillManifest(skill);

      expect(manifest).toContain("## Tool Sequence");
      expect(manifest).toContain("1. tool_a");
      expect(manifest).toContain("2. tool_b");
      expect(manifest).toContain("3. tool_c");
    });

    it("includes code snippet in fenced block", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "Test Description",
        codeSnippet: "const x = 42;\nconsole.log(x);",
      };

      const manifest = buildSkillManifest(skill);

      expect(manifest).toContain("## Code");
      expect(manifest).toContain("```javascript");
      expect(manifest).toContain("const x = 42;");
      expect(manifest).toContain("console.log(x);");
      expect(manifest).toContain("```");
    });

    it("omits empty sections", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "Test Description",
        strategy: "Just a strategy",
      };

      const manifest = buildSkillManifest(skill);

      // Should not contain sections that weren't provided
      expect(manifest).not.toContain("## Tool Sequence");
      expect(manifest).not.toContain("## Code");
      expect(manifest).not.toContain("## Notes");
    });

    it("includes notes section when provided", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "Test Description",
        strategy: "Strategy",
        notes: "Important: This skill requires X\nAlso: This skill assumes Y",
      };

      const manifest = buildSkillManifest(skill);

      expect(manifest).toContain("## Notes");
      expect(manifest).toContain("Important: This skill requires X");
      expect(manifest).toContain("Also: This skill assumes Y");
    });

    it("includes all sections when all fields provided", () => {
      const skill: ProceduralSkillInput = {
        name: "Complete Skill",
        description: "A complete skill",
        strategy: "Do step 1, then step 2",
        toolSequence: ["search", "analyze"],
        codeSnippet: "const result = await analyze();",
        notes: "Remember to validate input",
      };

      const manifest = buildSkillManifest(skill);

      expect(manifest).toContain("name: Complete Skill");
      expect(manifest).toContain("## Strategy");
      expect(manifest).toContain("## Tool Sequence");
      expect(manifest).toContain("## Code");
      expect(manifest).toContain("## Notes");
    });
  });

  describe("encodeSkillContent", () => {
    it("returns valid base64", () => {
      const content = "Hello, skill!";
      const encoded = encodeSkillContent(content);

      // Base64 should only contain valid characters
      expect(/^[A-Za-z0-9+/=]*$/.test(encoded)).toBe(true);
    });

    it("round-trips correctly", () => {
      const originalContent = "# SKILL.md\nname: test\ndescription: test skill";
      const encoded = encodeSkillContent(originalContent);
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");

      expect(decoded).toBe(originalContent);
    });

    it("handles special characters", () => {
      const content = "Special chars: éàù™© 中文 🚀";
      const encoded = encodeSkillContent(content);
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");

      expect(decoded).toBe(content);
    });

    it("handles multiline content", () => {
      const content = "Line 1\nLine 2\nLine 3\n\nWith blank lines";
      const encoded = encodeSkillContent(content);
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");

      expect(decoded).toBe(content);
    });
  });

  describe("buildInlineSkill", () => {
    it("returns correct structure", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "A test skill",
        strategy: "Test strategy",
      };

      const inlineSkill = buildInlineSkill(skill);

      expect(inlineSkill.type).toBe("inline");
      expect(inlineSkill.name).toBe("Test Skill");
      expect(inlineSkill.description).toBe("A test skill");
      expect(inlineSkill.source.type).toBe("base64");
      expect(inlineSkill.source.media_type).toBe("application/zip");
      expect(typeof inlineSkill.source.data).toBe("string");
    });

    it("encodes skill manifest as base64 data", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "A test skill",
        strategy: "Test strategy",
      };

      const inlineSkill = buildInlineSkill(skill);
      const decoded = Buffer.from(inlineSkill.source.data, "base64").toString(
        "utf-8"
      );

      expect(decoded).toContain("name: Test Skill");
      expect(decoded).toContain("description: A test skill");
      expect(decoded).toContain("Test strategy");
    });

    it("preserves all skill data in encoded manifest", () => {
      const skill: ProceduralSkillInput = {
        name: "Complex Skill",
        description: "A complex skill",
        strategy: "Multi-step approach",
        toolSequence: ["step1", "step2"],
        codeSnippet: "console.log('hello');",
        notes: "Be careful with this",
      };

      const inlineSkill = buildInlineSkill(skill);
      const decoded = Buffer.from(inlineSkill.source.data, "base64").toString(
        "utf-8"
      );

      expect(decoded).toContain("name: Complex Skill");
      expect(decoded).toContain("## Strategy");
      expect(decoded).toContain("## Tool Sequence");
      expect(decoded).toContain("## Code");
      expect(decoded).toContain("## Notes");
    });
  });

  describe("isSkillViable", () => {
    it("returns true for skill with strategy", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "Test Description",
        strategy: "Test strategy",
      };

      expect(isSkillViable(skill)).toBe(true);
    });

    it("returns true for skill with code snippet", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "Test Description",
        codeSnippet: "console.log('hello');",
      };

      expect(isSkillViable(skill)).toBe(true);
    });

    it("returns true for skill with tool sequence", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "Test Description",
        toolSequence: ["tool1", "tool2"],
      };

      expect(isSkillViable(skill)).toBe(true);
    });

    it("returns false for empty skill", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "Test Description",
      };

      expect(isSkillViable(skill)).toBe(false);
    });

    it("returns false for skill missing name", () => {
      const skill: ProceduralSkillInput = {
        name: "",
        description: "Test Description",
        strategy: "Test strategy",
      };

      expect(isSkillViable(skill)).toBe(false);
    });

    it("returns false for skill missing description", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "",
        strategy: "Test strategy",
      };

      expect(isSkillViable(skill)).toBe(false);
    });

    it("returns false for skill with empty tool sequence", () => {
      const skill: ProceduralSkillInput = {
        name: "Test Skill",
        description: "Test Description",
        toolSequence: [],
      };

      expect(isSkillViable(skill)).toBe(false);
    });

    it("returns true for skill with all fields", () => {
      const skill: ProceduralSkillInput = {
        name: "Complete Skill",
        description: "A complete skill",
        strategy: "Strategy",
        toolSequence: ["tool1"],
        codeSnippet: "code",
        notes: "notes",
      };

      expect(isSkillViable(skill)).toBe(true);
    });
  });
});
