/**
 * Hybrid retrieval service.
 *
 * Combines:
 * - semantic vector similarity via pgvector
 * - sparse lexical similarity via pg_trgm
 * - graph context via KGEvent + TemporalEdge
 */
type JsonRecord = Record<string, unknown>;
export type RetrievalSource = "semantic" | "sparse" | "graph";
export interface UnifiedRetrievalRecord {
    id: string;
    source: RetrievalSource;
    text: string;
    subjectId?: string;
    objectId?: string;
    predicate?: string;
    confidence: number;
    recencyScore: number;
    semanticScore: number;
    sparseScore: number;
    graphScore: number;
    sourceScore: number;
    score: number;
    metadata: JsonRecord;
}
/**
 * Fetches the top matches from semantic, sparse and graph sources and reranks them.
 */
export declare function unifiedRetrieval(query: string, subjectId?: string): Promise<UnifiedRetrievalRecord[]>;
/**
 * Embedding creator used by semantic search and tests.
 */
export declare function createQueryEmbedding(query: string): Promise<number[]>;
export {};
//# sourceMappingURL=retrieval.service.d.ts.map