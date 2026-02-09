import useSWR from "swr";
import { Workflow } from "@/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useWorkflows() {
  const { data, error, isLoading, mutate } = useSWR<{ workflows: Workflow[] }>(
    "/api/workflows",
    fetcher
  );

  return {
    workflows: data?.workflows ?? [],
    isLoading,
    isError: !!error,
    mutate,
  };
}
