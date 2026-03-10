import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

function findSkillsRoot(startDir: string, maxDepth = 8): string | null {
  let current = resolve(startDir);
  for (let depth = 0; depth < maxDepth; depth += 1) {
    const candidate = join(current, "skills");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = resolve(current, "..");
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return null;
}

function resolveSkillsRootDir(): string {
  const fromModule = import.meta.url.startsWith("file:")
    ? findSkillsRoot(dirname(fileURLToPath(import.meta.url)))
    : null;
  if (fromModule) {
    return fromModule;
  }

  const fromInitCwd = process.env.INIT_CWD
    ? findSkillsRoot(process.env.INIT_CWD)
    : null;
  if (fromInitCwd) {
    return fromInitCwd;
  }

  const fromCwd = findSkillsRoot(process.cwd());
  if (fromCwd) {
    return fromCwd;
  }

  throw new Error("Unable to locate skills directory for shell workflows");
}

// Lazy-initialized: deferred from module load time so that importing this
// module in environments without a skills directory (e.g. Vercel serverless)
// does not crash.  The directory is only resolved on first actual use.
let _skillsRootDir: string | null = null;

function getSkillsRootDir(): string {
  if (_skillsRootDir === null) {
    _skillsRootDir = resolveSkillsRootDir();
  }
  return _skillsRootDir;
}

export async function loadSkillInstructions(relativeSkillPath: string): Promise<string> {
  if (isAbsolute(relativeSkillPath)) {
    throw new Error("Skill path traversal is not allowed");
  }
  const skillsRoot = getSkillsRootDir();
  const resolvedPath = resolve(skillsRoot, relativeSkillPath);
  const relativePath = relative(skillsRoot, resolvedPath);
  if (relativePath.startsWith("..")) {
    throw new Error("Skill path traversal is not allowed");
  }
  return readFile(resolvedPath, "utf8");
}
