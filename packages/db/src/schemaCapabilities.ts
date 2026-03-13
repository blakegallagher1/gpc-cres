import { prisma } from "./client.js";

export type DataAgentSchemaCapabilities = {
  episode: boolean;
  kgEvent: boolean;
  temporalEdge: boolean;
  rewardSignal: boolean;
  knowledgeEmbedding: boolean;
};

type TableRow = {
  table_name: string;
};

let cachedKey: string | null = null;
let cachedCapabilities: DataAgentSchemaCapabilities | null = null;

function getCacheKey(): string {
  return process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL ?? "default";
}

function buildCapabilities(rows: TableRow[]): DataAgentSchemaCapabilities {
  const available = new Set(rows.map((row) => row.table_name));
  return {
    episode: available.has("Episode"),
    kgEvent: available.has("KGEvent"),
    temporalEdge: available.has("TemporalEdge"),
    rewardSignal: available.has("RewardSignal"),
    knowledgeEmbedding: available.has("KnowledgeEmbedding"),
  };
}

export async function getDataAgentSchemaCapabilities(): Promise<DataAgentSchemaCapabilities> {
  const cacheKey = getCacheKey();
  if (cachedCapabilities && cachedKey === cacheKey) {
    return cachedCapabilities;
  }

  const rows = await prisma.$queryRawUnsafe<TableRow[]>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN ('Episode', 'KGEvent', 'TemporalEdge', 'RewardSignal', 'KnowledgeEmbedding')
  `);

  cachedKey = cacheKey;
  cachedCapabilities = buildCapabilities(rows);
  return cachedCapabilities;
}
