import { type Workflow } from "@/types";

export function useWorkflows() {
  return {
    workflows: [] as Workflow[],
    isLoading: false,
    isError: false,
    mutate: () => Promise.resolve(undefined),
  };
}
