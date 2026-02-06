import useSWR from "swr";
import { Run } from "@/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export interface RunsQuery {
  agentId?: string;
  status?: string;
  limit?: number;
}

export function useRuns(query: RunsQuery = {}) {
  const params = new URLSearchParams();
  if (query.agentId) params.set("agentId", query.agentId);
  if (query.status) params.set("status", query.status);
  if (query.limit) params.set("limit", query.limit.toString());

  const key = `/api/runs${params.toString() ? `?${params.toString()}` : ""}`;

  const { data, error, isLoading, mutate } = useSWR<{ runs: Run[] }>(
    key,
    fetcher
  );

  return {
    runs: data?.runs ?? [],
    isLoading,
    isError: !!error,
    mutate,
  };
}
