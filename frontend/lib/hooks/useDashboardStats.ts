import useSWR from "swr";
import { DashboardStats } from "@/types";

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useDashboardStats() {
  const { data, error, isLoading, mutate } = useSWR<{ stats: DashboardStats }>(
    "/api/stats/dashboard",
    fetcher
  );

  return {
    stats: data?.stats,
    isLoading,
    isError: !!error,
    mutate,
  };
}
