/**
 * Disk-based tool output management (P3 Pattern 41).
 * Tools write large intermediate results to temp files and return paths.
 */

import { randomUUID } from "node:crypto";
import { join } from "node:path";

export type DiskOutputReference = {
  type: "disk_output";
  path: string;
  format: string;
  sizeEstimate: number;
  toolName: string;
  conversationId: string;
  createdAt: string;
};

const DEFAULT_TEMP_DIR = "/tmp/agent-outputs";
const SIZE_THRESHOLD_BYTES = 100_000; // 100KB

export function getWorkDir(conversationId: string): string {
  return join(DEFAULT_TEMP_DIR, conversationId);
}

export function buildOutputPath(options: {
  conversationId: string;
  toolName: string;
  format: string;
  tempDir?: string;
}): string {
  const dir = options.tempDir ?? getWorkDir(options.conversationId);
  const sanitized = options.toolName.replace(/[^a-zA-Z0-9_-]/g, "_");
  const id = randomUUID().slice(0, 8);
  return join(dir, `${sanitized}-${id}.${options.format}`);
}

export function shouldWriteToDisk(data: string | Buffer, threshold?: number): boolean {
  const size = typeof data === "string" ? Buffer.byteLength(data, "utf-8") : data.length;
  return size > (threshold ?? SIZE_THRESHOLD_BYTES);
}

export function buildDiskOutputReference(options: {
  path: string;
  format: string;
  sizeEstimate: number;
  toolName: string;
  conversationId: string;
}): DiskOutputReference {
  return {
    type: "disk_output",
    path: options.path,
    format: options.format,
    sizeEstimate: options.sizeEstimate,
    toolName: options.toolName,
    conversationId: options.conversationId,
    createdAt: new Date().toISOString(),
  };
}

export function isDiskOutputReference(value: unknown): value is DiskOutputReference {
  if (!value || typeof value !== "object") return false;
  return (value as Record<string, unknown>).type === "disk_output";
}

export function formatDiskOutputSummary(ref: DiskOutputReference): string {
  const sizeKB = (ref.sizeEstimate / 1024).toFixed(1);
  return `[Disk output: ${ref.format}, ${sizeKB}KB, tool=${ref.toolName}, path=${ref.path}]`;
}
