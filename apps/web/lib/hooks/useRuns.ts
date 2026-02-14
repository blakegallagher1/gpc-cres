import useSWR from "swr";
import { type WorkflowRun } from "@/types";

export interface RunsQuery {
  agentId?: string;
  status?: string;
  runType?: string;
  limit?: number;
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

function normalizeForCompare(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

export function useRuns(query: RunsQuery = {}) {
  const agentId = query.agentId;
  const params = new URLSearchParams();
  if (query.status) params.set("status", query.status);
  if (query.runType) params.set("runType", query.runType);
  if (query.limit) params.set("limit", String(query.limit));

  const key = `/api/runs${params.size ? `?${params.toString()}` : ""}`;
  const { data, error, isLoading, mutate } = useSWR<{ runs: WorkflowRun[] }>(
    key,
    fetcher,
  );

  const runs = (data?.runs ?? []) as WorkflowRun[];

  const filtered =
    agentId && agentId.length > 0
      ? runs.filter((run) => {
          const name = run.summary?.lastAgentName;
          if (!name) return false;
          return normalizeForCompare(name) === normalizeForCompare(agentId);
        })
      : runs;

  return {
    runs: filtered,
    isLoading,
    isError: !!error,
    mutate,
  };
}
