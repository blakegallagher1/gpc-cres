import "server-only";

export type PromptVersion = {
  id: string;
  agentId: string;
  version: number;
  content: string;
  description: string;
  qualityScore: number | null;
  isActive: boolean;
  createdAt: string;
};

// In-memory store (will be backed by Prisma AgentPromptVersion table later)
const promptVersions = new Map<string, PromptVersion[]>();

export function createPromptVersion(options: {
  agentId: string;
  content: string;
  description?: string;
}): PromptVersion {
  const versions = promptVersions.get(options.agentId) ?? [];
  const nextVersion = versions.length > 0 ? Math.max(...versions.map(v => v.version)) + 1 : 1;
  // Deactivate current active version
  for (const v of versions) v.isActive = false;
  const entry: PromptVersion = {
    id: `pv-${options.agentId}-${nextVersion}`,
    agentId: options.agentId,
    version: nextVersion,
    content: options.content,
    description: options.description ?? `Version ${nextVersion}`,
    qualityScore: null,
    isActive: true,
    createdAt: new Date().toISOString(),
  };
  versions.push(entry);
  promptVersions.set(options.agentId, versions);
  return entry;
}

export function getActivePrompt(agentId: string): PromptVersion | null {
  const versions = promptVersions.get(agentId) ?? [];
  return versions.find(v => v.isActive) ?? null;
}

export function getPromptVersion(agentId: string, version: number): PromptVersion | null {
  const versions = promptVersions.get(agentId) ?? [];
  return versions.find(v => v.version === version) ?? null;
}

export function listPromptVersions(agentId: string): PromptVersion[] {
  return [...(promptVersions.get(agentId) ?? [])].sort((a, b) => b.version - a.version);
}

export function revertToVersion(agentId: string, version: number): PromptVersion | null {
  const versions = promptVersions.get(agentId) ?? [];
  const target = versions.find(v => v.version === version);
  if (!target) return null;
  for (const v of versions) v.isActive = false;
  target.isActive = true;
  return target;
}

export function updateQualityScore(agentId: string, version: number, score: number): boolean {
  const v = getPromptVersion(agentId, version);
  if (!v) return false;
  v.qualityScore = score;
  return true;
}

export function getBestPerformingVersion(agentId: string): PromptVersion | null {
  const versions = promptVersions.get(agentId) ?? [];
  const scored = versions.filter(v => v.qualityScore !== null);
  if (scored.length === 0) return null;
  return scored.reduce((best, v) => (v.qualityScore! > best.qualityScore! ? v : best));
}

// For testing
export function _clearAllVersions(): void { promptVersions.clear(); }
