import {
  buildDataAgentRetrievalContext,
  isAgentOsFeatureEnabled,
} from "@entitlement-os/openai";
import { unifiedRetrieval as legacyUnifiedRetrieval } from "../../../../services/retrieval.service";

type RetrievalRecord = {
  id: string;
  source: "semantic" | "sparse" | "graph";
  text: string;
  score: number;
  metadata: Record<string, unknown>;
};

export async function unifiedRetrieval(
  query: string,
  subjectId?: string,
  orgId?: string,
): Promise<RetrievalRecord[]> {
  if (isAgentOsFeatureEnabled("qdrantHybridRetrieval")) {
    try {
      const context = await buildDataAgentRetrievalContext(query, subjectId, { orgId });
      return context.results.map((item) => ({
        id: item.id,
        source: item.source,
        text: item.text,
        score: item.score,
        metadata: item.metadata ?? {},
      }));
    } catch {
      // Fall through to legacy retrieval path when qdrant path is unavailable.
    }
  }

  const legacy = await legacyUnifiedRetrieval(query, subjectId, orgId);
  return legacy.map((item) => ({
    id: item.id,
    source: item.source,
    text: item.text,
    score: item.score,
    metadata: item.metadata ?? {},
  }));
}
