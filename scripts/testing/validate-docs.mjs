import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const docsRoot = path.join(repoRoot, "docs");
const indexPath = path.join(docsRoot, "INDEX.md");

const requiredHeaderFiles = [
  "docs/INDEX.md",
  "docs/OWNERSHIP.md",
  "docs/SOURCE_OF_TRUTH.md",
  "docs/ARCHIVE_POLICY.md",
  "docs/CHANGELOG_DOCS.md",
  "docs/OBSERVABILITY_MONITOR.md",
  "docs/AGENT_DOCS_PROTOCOL.md",
  "docs/runbooks/INCIDENT_RESPONSE.md",
  "docs/runbooks/RELEASE_VERIFICATION.md",
  "docs/runbooks/API_CONTRACTS.md",
];

const requiredHeaderFields = [
  "Status:",
  "Authority:",
  "Owner:",
  "Last reviewed:",
];

function normalize(relOrAbs) {
  return relOrAbs.split(path.sep).join("/");
}

function walkMarkdownFiles(dir) {
  const files = [];
  if (!fs.existsSync(dir)) return files;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(fullPath);
    }
  }
  return files;
}

function assertRequiredHeaders(errors) {
  for (const relPath of requiredHeaderFiles) {
    const absPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(absPath)) {
      errors.push(`Required doc missing: ${relPath}`);
      continue;
    }
    const content = fs.readFileSync(absPath, "utf8");
    for (const field of requiredHeaderFields) {
      if (!new RegExp(`^${field.replace(":", "\\:")}\\s+`, "m").test(content)) {
        errors.push(`${relPath} is missing required header field: ${field}`);
      }
    }
  }
}

function assertArchiveBanners(errors) {
  const allDocs = walkMarkdownFiles(docsRoot);
  for (const absPath of allDocs) {
    const relPath = normalize(path.relative(repoRoot, absPath));
    const content = fs.readFileSync(absPath, "utf8");
    const headerWindow = content.split("\n").slice(0, 12).join("\n");
    const isArchived = /^\s*>?\s*\**\s*Status:\s*Archived\b/im.test(
      headerWindow,
    );

    if (!isArchived) continue;

    if (!/non-authoritative/i.test(content)) {
      errors.push(
        `${relPath} is archived but missing explicit "non-authoritative" banner text`,
      );
    }
  }
}

function assertIndexLinks(errors) {
  if (!fs.existsSync(indexPath)) {
    errors.push("docs/INDEX.md not found");
    return;
  }

  const content = fs.readFileSync(indexPath, "utf8");
  const linkRegex = /`(docs\/[^`]+?\.md)`/g;
  const links = new Set();

  for (const match of content.matchAll(linkRegex)) {
    links.add(match[1]);
  }

  if (links.size === 0) {
    errors.push("docs/INDEX.md contains no backticked docs/*.md links to validate");
    return;
  }

  for (const relPath of links) {
    const absPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(absPath)) {
      errors.push(`docs/INDEX.md has broken link: ${relPath}`);
    }
  }
}

function assertManifest(errors) {
  const manifestPath = path.join(docsRoot, "DOCS_MANIFEST.json");
  if (!fs.existsSync(manifestPath)) {
    errors.push("docs/DOCS_MANIFEST.json not found");
    return;
  }

  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  } catch (error) {
    errors.push(
      `docs/DOCS_MANIFEST.json is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return;
  }

  if (!Array.isArray(manifest.authoritativeDocs)) {
    errors.push("docs/DOCS_MANIFEST.json missing authoritativeDocs array");
    return;
  }

  for (const entry of manifest.authoritativeDocs) {
    const relPath = entry?.path;
    if (typeof relPath !== "string" || relPath.trim() === "") {
      errors.push(
        "docs/DOCS_MANIFEST.json contains authoritativeDocs entry with invalid path",
      );
      continue;
    }
    const absPath = path.join(repoRoot, relPath);
    if (!fs.existsSync(absPath)) {
      errors.push(
        `docs/DOCS_MANIFEST.json references missing authoritative doc: ${relPath}`,
      );
    }
  }
}

function main() {
  const errors = [];

  assertRequiredHeaders(errors);
  assertArchiveBanners(errors);
  assertIndexLinks(errors);
  assertManifest(errors);

  if (errors.length > 0) {
    console.error("Documentation validation failed:");
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exit(1);
  }

  console.log("Documentation validation passed.");
}

main();
