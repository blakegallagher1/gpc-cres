import { buildDataAgentRetrievalContext } from "@entitlement-os/openai";

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
  const context = await buildDataAgentRetrievalContext(query, subjectId, { orgId });
  return context.results.map((item) => ({
    id: item.id,
    source: item.source,
    text: item.text,
    score: item.score,
    metadata: item.metadata ?? {},
  }));
}
