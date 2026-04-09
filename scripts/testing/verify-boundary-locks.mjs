import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const packageRoots = ["packages/openai", "packages/server", "packages/shared", "packages/evidence", "packages/artifacts", "packages/gateway-client", "packages/db"];
const appRoot = "apps/web";
const codeExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"]);
const ignoredSegments = new Set(["node_modules", "dist", ".next", "coverage"]);
const approvedDbImports = new Set([
  "apps/web/auth.ts",
  "apps/web/lib/agent/executeAgent.ts",
  "apps/web/lib/auth/authorizeApiRoute.ts",
  "apps/web/lib/auth/routeAuth.ts",
]);

const productionAppCodeRoots = [
  "apps/web/app",
  "apps/web/lib",
  "apps/web/components",
  "apps/web/types",
];

const packageImportPattern =
  /(?:import|export)\s+(?:type\s+)?(?:[^"'`]+\s+from\s+)?["'`]([^"'`]+)["'`]|import\s*\(\s*["'`]([^"'`]+)["'`]\s*\)|require\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

function walk(relativeDir) {
  const absoluteDir = path.join(repoRoot, relativeDir);
  const entries = readdirSync(absoluteDir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (ignoredSegments.has(entry.name)) continue;

    const relativePath = path.join(relativeDir, entry.name);
    const absolutePath = path.join(repoRoot, relativePath);

    if (entry.isDirectory()) {
      files.push(...walk(relativePath));
      continue;
    }

    if (!entry.isFile()) continue;
    if (!codeExtensions.has(path.extname(entry.name))) continue;
    files.push(relativePath);
  }

  return files;
}

function collectImportSpecifiers(source) {
  const matches = [];
  let match = packageImportPattern.exec(source);
  while (match) {
    const specifier = match[1] ?? match[2] ?? match[3];
    if (specifier) {
      matches.push(specifier);
    }
    match = packageImportPattern.exec(source);
  }
  packageImportPattern.lastIndex = 0;
  return matches;
}

function isProductionAppFile(relativePath) {
  if (relativePath.includes("/__tests__/") || relativePath.endsWith(".test.ts") || relativePath.endsWith(".test.tsx")) {
    return false;
  }
  if (relativePath.startsWith("apps/web/scripts/")) {
    return false;
  }
  return productionAppCodeRoots.some((root) => relativePath.startsWith(`${root}/`) || relativePath === root);
}

function containsAppsWebReverseImport(specifier) {
  return (
    specifier.startsWith("@/") ||
    specifier.startsWith("apps/web/") ||
    specifier.includes("/apps/web/") ||
    specifier === "apps/web"
  );
}

function main() {
  const violations = [];

  for (const packageRoot of packageRoots) {
    for (const relativePath of walk(packageRoot)) {
      const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
      const specifiers = collectImportSpecifiers(source);
      for (const specifier of specifiers) {
        if (containsAppsWebReverseImport(specifier)) {
          violations.push(
            `${relativePath}: forbidden package -> apps/web import '${specifier}'`,
          );
        }
      }
    }
  }

  for (const relativePath of walk(appRoot)) {
    if (!isProductionAppFile(relativePath)) continue;
    if (approvedDbImports.has(relativePath)) continue;

    const source = readFileSync(path.join(repoRoot, relativePath), "utf8");
    const specifiers = collectImportSpecifiers(source);
    for (const specifier of specifiers) {
      if (specifier === "@entitlement-os/db" || specifier.startsWith("@entitlement-os/db/")) {
        violations.push(
          `${relativePath}: forbidden direct db import '${specifier}' outside approved app auth seams`,
        );
      }
    }
  }

  if (violations.length > 0) {
    console.error("Boundary lock violations detected:\n");
    for (const violation of violations) {
      console.error(`- ${violation}`);
    }
    process.exit(1);
  }

  console.log("Boundary locks verified: no package reverse imports and no unapproved direct db imports.");
}

main();
