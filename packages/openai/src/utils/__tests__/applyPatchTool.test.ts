import { describe, it, expect } from "vitest";
import {
  parsePatch,
  validatePatchSecurity,
  isPatchFormat,
  type ParsedPatch,
} from "../applyPatchTool";

describe("applyPatchTool", () => {
  describe("parsePatch", () => {
    it("extracts Add File hunks", () => {
      const patch = `
*** Begin Patch
*** Add File: docs/test.md
# Test Document
This is a test.
*** End Patch
`;
      const result = parsePatch(patch);
      expect(result.valid).toBe(true);
      expect(result.hunks).toHaveLength(1);
      expect(result.hunks[0]).toEqual({
        type: "add",
        filePath: "docs/test.md",
        content: "# Test Document\nThis is a test.",
      });
    });

    it("extracts Update File hunks", () => {
      const patch = `
*** Begin Patch
*** Update File: docs/existing.md
Updated content here.
*** End Patch
`;
      const result = parsePatch(patch);
      expect(result.valid).toBe(true);
      expect(result.hunks).toHaveLength(1);
      expect(result.hunks[0].type).toBe("update");
      expect(result.hunks[0].filePath).toBe("docs/existing.md");
      expect(result.hunks[0].content).toBe("Updated content here.");
    });

    it("extracts Delete File hunks", () => {
      const patch = `
*** Begin Patch
*** Delete File: docs/old.md
*** End Patch
`;
      const result = parsePatch(patch);
      expect(result.valid).toBe(true);
      expect(result.hunks).toHaveLength(1);
      expect(result.hunks[0]).toEqual({
        type: "delete",
        filePath: "docs/old.md",
        content: "",
      });
    });

    it("extracts multiple hunks", () => {
      const patch = `
*** Begin Patch
*** Add File: docs/file1.md
Content of file 1
*** Update File: docs/file2.md
Updated content
*** Delete File: docs/file3.md
*** End Patch
`;
      const result = parsePatch(patch);
      expect(result.valid).toBe(true);
      expect(result.hunks).toHaveLength(3);
      expect(result.hunks[0].type).toBe("add");
      expect(result.hunks[1].type).toBe("update");
      expect(result.hunks[2].type).toBe("delete");
    });

    it("returns invalid for empty patch", () => {
      const patch = `
*** Begin Patch
*** End Patch
`;
      const result = parsePatch(patch);
      expect(result.valid).toBe(false);
      expect(result.error).toBe("No valid hunks found in patch");
    });

    it("handles Begin/End Patch markers", () => {
      const patch = `
Some preamble text that should be ignored.
*** Begin Patch
*** Add File: docs/test.md
Content
*** End Patch
Some epilogue text that should be ignored.
`;
      const result = parsePatch(patch);
      expect(result.valid).toBe(true);
      expect(result.hunks).toHaveLength(1);
      expect(result.hunks[0].filePath).toBe("docs/test.md");
    });

    it("preserves multiline content", () => {
      const patch = `
*** Begin Patch
*** Add File: docs/multiline.md
# Header
Paragraph 1

Paragraph 2
- List item 1
- List item 2
*** End Patch
`;
      const result = parsePatch(patch);
      expect(result.valid).toBe(true);
      expect(result.hunks[0].content).toContain("# Header");
      expect(result.hunks[0].content).toContain("Paragraph 1");
      expect(result.hunks[0].content).toContain("- List item 2");
    });

    it("handles dashed separator instead of Begin Patch", () => {
      const patch = `
---
*** Add File: docs/test.md
Content
*** End Patch
`;
      const result = parsePatch(patch);
      expect(result.valid).toBe(true);
      expect(result.hunks).toHaveLength(1);
    });
  });

  describe("validatePatchSecurity", () => {
    it("allows docs/ paths", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "add", filePath: "docs/test.md", content: "test" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("allows scripts/ paths", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "add", filePath: "scripts/deploy.sh", content: "#!/bin/bash" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("allows skills/ paths", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "add", filePath: "skills/test/SKILL.md", content: "test" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("allows infra/local-api/config/ paths", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "add", filePath: "infra/local-api/config/settings.yaml", content: "test" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("blocks src/ paths", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "add", filePath: "src/index.ts", content: "test" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Blocked path: src/index.ts — cannot modify source code directories"
      );
    });

    it("blocks packages/ paths", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "add", filePath: "packages/test/index.ts", content: "test" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("packages/test/index.ts"))).toBe(true);
    });

    it("blocks apps/ paths", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "add", filePath: "apps/web/app/page.tsx", content: "test" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("apps/web/app/page.tsx"))).toBe(true);
    });

    it("blocks node_modules/ paths", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "add", filePath: "node_modules/test/index.js", content: "test" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("node_modules/test/index.js"))).toBe(true);
    });

    it("blocks .git/ paths", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "add", filePath: ".git/config", content: "test" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes(".git/config"))).toBe(true);
    });

    it("detects path traversal with ..", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "add", filePath: "docs/../src/index.ts", content: "test" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        "Path traversal detected: docs/../src/index.ts"
      );
    });

    it("warns on delete operations", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "delete", filePath: "docs/old.md", content: "" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(true);
      expect(result.warnings).toContain(
        "Delete operation on docs/old.md — requires explicit approval"
      );
    });

    it("warns on paths outside allowed directories", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "add", filePath: "README.md", content: "test" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("README.md is outside allowed directories");
    });

    it("validates multiple hunks with mixed results", () => {
      const patch: ParsedPatch = {
        valid: true,
        hunks: [
          { type: "add", filePath: "docs/allowed.md", content: "test" },
          { type: "add", filePath: "src/blocked.ts", content: "test" },
          { type: "delete", filePath: "scripts/old.sh", content: "" },
        ],
      };
      const result = validatePatchSecurity(patch);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe("isPatchFormat", () => {
    it("detects *** Begin Patch marker", () => {
      const text = "*** Begin Patch\nContent here";
      expect(isPatchFormat(text)).toBe(true);
    });

    it("detects *** Add File: marker", () => {
      const text = "*** Add File: docs/test.md\nContent";
      expect(isPatchFormat(text)).toBe(true);
    });

    it("detects *** Update File: marker", () => {
      const text = "*** Update File: docs/test.md\nContent";
      expect(isPatchFormat(text)).toBe(true);
    });

    it("returns false for plain text", () => {
      const text = "This is just a regular document\nwith no patch markers";
      expect(isPatchFormat(text)).toBe(false);
    });

    it("returns false for other diff formats", () => {
      const text = `
--- a/file.ts
+++ b/file.ts
@@ -1,5 +1,6 @@
`;
      expect(isPatchFormat(text)).toBe(false);
    });

    it("detects patch format with whitespace", () => {
      const text = "Some text\n*** Begin Patch\nMore text";
      expect(isPatchFormat(text)).toBe(true);
    });
  });
});
