import { create } from "zustand";

interface AgentRunInput {
  query?: string;
  [key: string]: unknown;
}

interface AgentStoreState {
  isLoading: boolean;
  runAgent: (agentId: string, input: AgentRunInput) => Promise<void>;
}

export const useAgentStore = create<AgentStoreState>((set) => ({
  isLoading: false,
  runAgent: async (agentId, input) => {
    set({ isLoading: true });
    try {
      const response = await fetch(`/api/agents/${agentId}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error?.error || "Failed to run agent");
      }
    } finally {
      set({ isLoading: false });
    }
  },
}));
