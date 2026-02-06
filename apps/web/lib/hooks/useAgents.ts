import useSWR from "swr";
import { Agent } from "@/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useAgents() {
  const { data, error, isLoading, mutate } = useSWR<{ agents: Agent[] }>(
    "/api/agents",
    fetcher
  );

  return {
    agents: data?.agents ?? [],
    isLoading,
    isError: !!error,
    mutate,
  };
}
