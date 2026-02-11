import { create } from "zustand";

interface AgentRunInput {
  query?: string;
  [key: string]: unknown;
}

interface AgentStoreState {
  isLoading: boolean;
  runAgent: (agentId: string, input: AgentRunInput) => Promise<void>;
}

export const useAgentStore = create((set): AgentStoreState => ({
  isLoading: false,
  runAgent: async (_agentId, _input) => {
    set({ isLoading: true });
    try {
      // Agent runs are now handled through the chat interface at /
      // This store is kept for API compatibility
      console.info("Agent runs are handled through the chat interface");
    } finally {
      set({ isLoading: false });
    }
  },
}));
