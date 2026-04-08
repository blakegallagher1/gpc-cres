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

const promptVersions = new Map<string, PromptVersion[]>();

export function createPromptVersion(options: {
  agentId: string;
  content: string;
  description?: string;
}): PromptVersion {
  const versions = promptVersions.get(options.agentId) ?? [];
  const nextVersion =
    versions.length > 0
      ? Math.max(...versions.map((version) => version.version)) + 1
      : 1;

  for (const version of versions) version.isActive = false;

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
  return versions.find((version) => version.isActive) ?? null;
}

export function getPromptVersion(
  agentId: string,
  version: number,
): PromptVersion | null {
  const versions = promptVersions.get(agentId) ?? [];
  return versions.find((entry) => entry.version === version) ?? null;
}

export function listPromptVersions(agentId: string): PromptVersion[] {
  return [...(promptVersions.get(agentId) ?? [])].sort(
    (left, right) => right.version - left.version,
  );
}

export function revertToVersion(
  agentId: string,
  version: number,
): PromptVersion | null {
  const versions = promptVersions.get(agentId) ?? [];
  const target = versions.find((entry) => entry.version === version);
  if (!target) return null;
  for (const entry of versions) entry.isActive = false;
  target.isActive = true;
  return target;
}

export function updateQualityScore(
  agentId: string,
  version: number,
  score: number,
): boolean {
  const entry = getPromptVersion(agentId, version);
  if (!entry) return false;
  entry.qualityScore = score;
  return true;
}

export function getBestPerformingVersion(agentId: string): PromptVersion | null {
  const versions = promptVersions.get(agentId) ?? [];
  const scored = versions.filter((version) => version.qualityScore !== null);
  if (scored.length === 0) return null;
  return scored.reduce((best, current) =>
    current.qualityScore! > best.qualityScore! ? current : best,
  );
}

export function _clearAllVersions(): void {
  promptVersions.clear();
}
