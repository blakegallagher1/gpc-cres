import type { PrismaClient } from "@entitlement-os/db";

import { getAgentOsConfig, isAgentOsFeatureEnabled } from "../config.js";
import { EpisodicMemoryStore, type ScoredEpisodicEntry } from "./episodic.js";
import { SemanticMemoryStore, type SemanticFactRecord } from "./semantic.js";
import { SkillStore, type ScoredSkill } from "./procedural.js";
import { DomainMemoryStore, type ScoredDomainDoc } from "./domain.js";

const CHARS_PER_TOKEN = 4;

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function truncateToTokenBudget(text: string, budget: number): string {
  const maxChars = budget * CHARS_PER_TOKEN;
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + "\n[...truncated to budget...]";
}

function formatEpisodic(entries: ScoredEpisodicEntry[]): string {
  if (entries.length === 0) return "";
  const lines = entries.map(
    (e) =>
      `- [${e.outcome}] (score=${e.score.toFixed(2)}, agent=${e.agentId}): ${e.summary}`,
  );
  return `## Episodic Memory (past experiences)\n${lines.join("\n")}`;
}

function formatSkills(skills: ScoredSkill[]): string {
  if (skills.length === 0) return "";
  const lines = skills.map(
    (s) =>
      `- **${s.name}** (success=${(s.successRate * 100).toFixed(0)}%, score=${s.score.toFixed(2)}): ${s.description}\n  Tools: ${s.toolSequence.join(" → ")}`,
  );
  return `## Procedural Memory (learned skills)\n${lines.join("\n")}`;
}

function formatDomain(docs: ScoredDomainDoc[]): string {
  if (docs.length === 0) return "";
  const lines = docs.map(
    (d) =>
      `- [${d.sourceType}] **${d.title}** (score=${d.score.toFixed(2)}): ${d.summary}`,
  );
  return `## Domain Knowledge\n${lines.join("\n")}`;
}

function formatSemantic(facts: SemanticFactRecord[]): string {
  if (facts.length === 0) return "";
  const lines = facts.map((f) => {
    const val =
      typeof f.valueJson === "string"
        ? f.valueJson
        : JSON.stringify(f.valueJson);
    const shortVal = val.length > 200 ? val.slice(0, 200) + "…" : val;
    return `- **${f.key}** (conf=${f.confidence.toFixed(2)}): ${shortVal}`;
  });
  return `## Semantic Facts\n${lines.join("\n")}`;
}

export type ContextBuilderResult = {
  text: string;
  episodicCount: number;
  skillCount: number;
  domainCount: number;
  semanticCount: number;
  estimatedTokens: number;
};

export class ContextBuilder {
  private episodic: EpisodicMemoryStore;
  private semantic: SemanticMemoryStore;
  private procedural: SkillStore;
  private domain: DomainMemoryStore;

  constructor(prisma: PrismaClient, qdrantUrl: string) {
    this.episodic = new EpisodicMemoryStore(prisma, qdrantUrl);
    this.semantic = new SemanticMemoryStore(prisma);
    this.procedural = new SkillStore(prisma, qdrantUrl);
    this.domain = new DomainMemoryStore(prisma, qdrantUrl);
  }

  async build(
    query: string,
    orgId: string,
    _agentId: string,
  ): Promise<ContextBuilderResult> {
    const config = getAgentOsConfig();
    const budgets = config.contextBudgets;

    const [episodicEntries, skills, domainDocs, semanticFacts] = await Promise.all([
      isAgentOsFeatureEnabled("episodicMemory")
        ? this.episodic.retrieve(query, orgId, undefined, 3)
        : Promise.resolve([] as ScoredEpisodicEntry[]),
      isAgentOsFeatureEnabled("proceduralMemory")
        ? this.procedural.retrieve(query, orgId, 2)
        : Promise.resolve([] as ScoredSkill[]),
      isAgentOsFeatureEnabled("domainMemory")
        ? this.domain.retrieve(query, orgId, undefined, 3)
        : Promise.resolve([] as ScoredDomainDoc[]),
      isAgentOsFeatureEnabled("semanticMemory")
        ? this.semantic.getAll(orgId, 0.5).then((all) => all.slice(0, 20))
        : Promise.resolve([] as SemanticFactRecord[]),
    ]);

    const sections: string[] = [];

    const episodicBlock = truncateToTokenBudget(formatEpisodic(episodicEntries), budgets.episodic);
    if (episodicBlock) sections.push(episodicBlock);

    const skillBlock = truncateToTokenBudget(formatSkills(skills), budgets.skills);
    if (skillBlock) sections.push(skillBlock);

    const domainBlock = truncateToTokenBudget(formatDomain(domainDocs), budgets.domain);
    if (domainBlock) sections.push(domainBlock);

    const semanticBlock = truncateToTokenBudget(formatSemantic(semanticFacts), budgets.semantic);
    if (semanticBlock) sections.push(semanticBlock);

    let text = sections.join("\n\n");

    if (estimateTokens(text) > budgets.hardCap) {
      text = truncateToTokenBudget(text, budgets.hardCap);
    }

    return {
      text,
      episodicCount: episodicEntries.length,
      skillCount: skills.length,
      domainCount: domainDocs.length,
      semanticCount: semanticFacts.length,
      estimatedTokens: estimateTokens(text),
    };
  }
}
