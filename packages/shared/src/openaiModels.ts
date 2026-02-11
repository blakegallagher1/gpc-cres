export const AGENT_MODEL_IDS = {
  coordinator: "gpt-5.2",
  finance: "gpt-5.2",
  legal: "gpt-5.2",
  research: "gpt-5.2",
  risk: "gpt-5.1",
  screener: "gpt-5.1",
  dueDiligence: "gpt-5.1",
  entitlements: "gpt-5.1",
  design: "gpt-5.1",
  operations: "gpt-5.1",
  marketing: "gpt-5.1",
  tax: "gpt-5.1",
  marketIntel: "gpt-5.1",
} as const;

export type AgentModelId = (typeof AGENT_MODEL_IDS)[keyof typeof AGENT_MODEL_IDS];
