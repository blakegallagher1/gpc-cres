/**
 * Artifact boundary utilities for managing large tool outputs (P2 Pattern 30).
 * Large outputs are written to disk and referenced by path rather than
 * passed through conversation context.
 */

export type ArtifactReference = {
  type: "artifact_reference";
  path: string;
  size: number;
  format: string;
  label?: string;
  createdAt: string;
};

const ARTIFACT_THRESHOLD_BYTES = 50_000; // 50KB — above this, write to disk
const DEFAULT_ARTIFACT_DIR = "/mnt/data";

export function shouldWriteArtifact(data: string | Buffer): boolean {
  const size = typeof data === "string" ? Buffer.byteLength(data, "utf-8") : data.length;
  return size > ARTIFACT_THRESHOLD_BYTES;
}

export function buildArtifactPath(options: {
  dir?: string;
  toolName: string;
  format: string;
  timestamp?: number;
}): string {
  const dir = options.dir ?? DEFAULT_ARTIFACT_DIR;
  const ts = options.timestamp ?? Date.now();
  const sanitizedName = options.toolName.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `${dir}/${sanitizedName}-${ts}.${options.format}`;
}

export function buildArtifactReference(options: {
  path: string;
  size: number;
  format: string;
  label?: string;
}): ArtifactReference {
  return {
    type: "artifact_reference",
    path: options.path,
    size: options.size,
    format: options.format,
    label: options.label,
    createdAt: new Date().toISOString(),
  };
}

export function isArtifactReference(value: unknown): value is ArtifactReference {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return obj.type === "artifact_reference" && typeof obj.path === "string";
}

export function formatArtifactSummary(ref: ArtifactReference): string {
  const sizeKB = (ref.size / 1024).toFixed(1);
  const label = ref.label ? ` (${ref.label})` : "";
  return `[Artifact${label}: ${ref.format} file, ${sizeKB}KB at ${ref.path}]`;
}
