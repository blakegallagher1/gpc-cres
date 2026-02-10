import { type Agent } from "@/types";

const AGENT_COLORS: Record<string, string> = {
  coordinator: "#6366f1",
  finance: "#22c55e",
  legal: "#f59e0b",
  research: "#3b82f6",
  risk: "#ef4444",
  screener: "#8b5cf6",
  "due-diligence": "#06b6d4",
  entitlements: "#f97316",
  design: "#ec4899",
  operations: "#14b8a6",
  marketing: "#a855f7",
  tax: "#eab308",
  "market-intel": "#0ea5e9",
};

const STATIC_AGENTS: Agent[] = [
  { id: "coordinator", name: "Coordinator", model: "gpt-5.2", description: "Routes to specialists, manages deal context", handoffs: ["finance", "legal", "research", "risk", "screener", "due-diligence", "entitlements", "design", "operations", "marketing", "tax", "market-intel"] },
  { id: "finance", name: "Finance", model: "gpt-5.2", description: "Pro formas, debt sizing, IRR/equity analysis", handoffs: ["coordinator"] },
  { id: "legal", name: "Legal", model: "gpt-5.2", description: "Zoning, entitlements, Louisiana civil law", handoffs: ["coordinator"] },
  { id: "research", name: "Research", model: "gpt-5.2", description: "Land scouting, market analysis, comps", handoffs: ["coordinator"] },
  { id: "risk", name: "Risk", model: "gpt-5.1", description: "Flood, environmental, financial, regulatory risk", handoffs: ["coordinator"] },
  { id: "screener", name: "Screener", model: "gpt-5.1", description: "Triage scoring (KILL/HOLD/ADVANCE)", handoffs: ["coordinator"] },
  { id: "due-diligence", name: "Due Diligence", model: "gpt-5.1", description: "Phase checklists, red flags, document tracking", handoffs: ["coordinator"] },
  { id: "entitlements", name: "Entitlements", model: "gpt-5.1", description: "Permit tracking, CUP/rezoning paths", handoffs: ["coordinator"] },
  { id: "design", name: "Design", model: "gpt-5.1", description: "Site planning, density optimization", handoffs: ["coordinator"] },
  { id: "operations", name: "Operations", model: "gpt-5.1", description: "Construction scheduling, budgets", handoffs: ["coordinator"] },
  { id: "marketing", name: "Marketing", model: "gpt-5.1", description: "Buyer outreach, leasing strategy", handoffs: ["coordinator"] },
  { id: "tax", name: "Tax Strategist", model: "gpt-5.1", description: "IRC 1031, depreciation, cost segregation", handoffs: ["coordinator"] },
  { id: "market-intel", name: "Market Intel", model: "gpt-5.1", description: "Competitor tracking, absorption trends", handoffs: ["coordinator"] },
].map((a) => ({
  ...a,
  tools: [],
  config: {},
  status: "active" as const,
  run_count: 0,
  color: AGENT_COLORS[a.id],
  system_prompt: "",
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
}));

export function useAgents() {
  return {
    agents: STATIC_AGENTS,
    isLoading: false,
    isError: false,
    mutate: () => Promise.resolve(undefined),
  };
}
