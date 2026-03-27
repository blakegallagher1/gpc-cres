/**
 * Apply-patch utilities for unified diff application (P3 Pattern 45).
 * GPT-5.3+ is extensively trained on the *** Begin Patch / *** End Patch format.
 */

export type PatchHunk = {
  type: "add" | "delete" | "update";
  filePath: string;
  content: string;
};

export type ParsedPatch = {
  hunks: PatchHunk[];
  valid: boolean;
  error?: string;
};

export type PatchValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
};

const ALLOWED_DIRECTORIES = ["docs/", "scripts/", "skills/", "infra/local-api/config/"];
const BLOCKED_DIRECTORIES = ["node_modules/", ".git/", ".env", "src/", "packages/", "apps/"];

export function parsePatch(patchText: string): ParsedPatch {
  const hunks: PatchHunk[] = [];
  const lines = patchText.split("\n");
  let currentHunk: Partial<PatchHunk> | null = null;
  let contentLines: string[] = [];
  let inPatch = false;

  for (const line of lines) {
    if (line.trim() === "*** Begin Patch" || line.trim() === "---") {
      inPatch = true;
      continue;
    }
    if (line.trim() === "*** End Patch") {
      if (currentHunk && currentHunk.filePath && currentHunk.type) {
        // Trim trailing empty lines from content
        while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === "") {
          contentLines.pop();
        }
        hunks.push({ ...currentHunk, content: contentLines.join("\n") } as PatchHunk);
      }
      currentHunk = null;
      contentLines = [];
      inPatch = false;
      break;
    }
    if (!inPatch) continue;

    if (line.startsWith("*** Add File: ")) {
      if (currentHunk?.filePath) {
        // Trim trailing empty lines from content
        while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === "") {
          contentLines.pop();
        }
        hunks.push({ ...currentHunk, content: contentLines.join("\n") } as PatchHunk);
      }
      currentHunk = { type: "add", filePath: line.slice("*** Add File: ".length).trim() };
      contentLines = [];
    } else if (line.startsWith("*** Delete File: ")) {
      if (currentHunk?.filePath) {
        // Trim trailing empty lines from content
        while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === "") {
          contentLines.pop();
        }
        hunks.push({ ...currentHunk, content: contentLines.join("\n") } as PatchHunk);
      }
      hunks.push({ type: "delete", filePath: line.slice("*** Delete File: ".length).trim(), content: "" });
      currentHunk = null;
      contentLines = [];
    } else if (line.startsWith("*** Update File: ")) {
      if (currentHunk?.filePath) {
        // Trim trailing empty lines from content
        while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === "") {
          contentLines.pop();
        }
        hunks.push({ ...currentHunk, content: contentLines.join("\n") } as PatchHunk);
      }
      currentHunk = { type: "update", filePath: line.slice("*** Update File: ".length).trim() };
      contentLines = [];
    } else if (currentHunk) {
      contentLines.push(line);
    }
  }

  if (currentHunk?.filePath && currentHunk.type) {
    // Trim trailing empty lines from content
    while (contentLines.length > 0 && contentLines[contentLines.length - 1].trim() === "") {
      contentLines.pop();
    }
    hunks.push({ ...currentHunk, content: contentLines.join("\n") } as PatchHunk);
  }

  if (hunks.length === 0) {
    return { hunks: [], valid: false, error: "No valid hunks found in patch" };
  }
  return { hunks, valid: true };
}

export function validatePatchSecurity(patch: ParsedPatch): PatchValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const hunk of patch.hunks) {
    const path = hunk.filePath;
    const isAllowed = ALLOWED_DIRECTORIES.some((dir) => path.startsWith(dir));
    const isBlocked = BLOCKED_DIRECTORIES.some((dir) => path.startsWith(dir) || path.includes(`/${dir}`));

    if (isBlocked) {
      errors.push(`Blocked path: ${path} — cannot modify source code directories`);
    } else if (!isAllowed) {
      warnings.push(`Path ${path} is outside allowed directories: ${ALLOWED_DIRECTORIES.join(", ")}`);
    }

    if (path.includes("..")) {
      errors.push(`Path traversal detected: ${path}`);
    }

    if (hunk.type === "delete") {
      warnings.push(`Delete operation on ${path} — requires explicit approval`);
    }
  }

  return { valid: errors.length === 0, errors, warnings };
}

export function isPatchFormat(text: string): boolean {
  return text.includes("*** Begin Patch") || text.includes("*** Add File:") || text.includes("*** Update File:");
}
