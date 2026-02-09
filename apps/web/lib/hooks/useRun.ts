import useSWR from "swr";
import { Run } from "@/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useRun(runId?: string) {
  const { data, error, isLoading, mutate } = useSWR<{ run: Run }>(
    runId ? `/api/runs/${runId}` : null,
    fetcher
  );

  return {
    run: data?.run,
    isLoading,
    isError: !!error,
    mutate,
  };
}
