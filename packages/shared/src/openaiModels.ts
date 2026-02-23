export const AGENT_MODEL_IDS = {
  coordinator: "gpt-5.2",
  finance: "gpt-5.2",
  legal: "gpt-5.2",
  research: "gpt-5.2",
  risk: "gpt-5.2",
  screener: "gpt-5.2",
  dueDiligence: "gpt-5.2",
  entitlements: "gpt-5.2",
  design: "gpt-5.2",
  operations: "gpt-5.2",
  marketing: "gpt-5.2",
  tax: "gpt-5.2",
  marketIntel: "gpt-5.2",
  marketTrajectory: "gpt-5.2",
} as const;

export type AgentModelId = (typeof AGENT_MODEL_IDS)[keyof typeof AGENT_MODEL_IDS];
