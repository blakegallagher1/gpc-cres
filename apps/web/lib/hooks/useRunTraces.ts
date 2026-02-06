import useSWR from "swr";
import { Trace } from "@/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useRunTraces(runId?: string) {
  const { data, error, isLoading, mutate } = useSWR<{ traces: Trace[] }>(
    runId ? `/api/runs/${runId}/traces` : null,
    fetcher
  );

  return {
    traces: data?.traces ?? [],
    isLoading,
    isError: !!error,
    mutate,
  };
}
