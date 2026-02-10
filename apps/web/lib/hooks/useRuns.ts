import { type Run } from "@/types";

export interface RunsQuery {
  agentId?: string;
  status?: string;
  limit?: number;
}

export function useRuns(_query: RunsQuery = {}) {
  return {
    runs: [] as Run[],
    isLoading: false,
    isError: false,
    mutate: () => Promise.resolve(undefined),
  };
}
