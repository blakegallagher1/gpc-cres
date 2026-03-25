export const AGENT_MODEL_ID = "gpt-5.4" as const;

/**
 * @deprecated Use AGENT_MODEL_ID instead. All agents now use gpt-5.4.
 */
export const AGENT_MODEL_IDS = {
  coordinator: AGENT_MODEL_ID,
  finance: AGENT_MODEL_ID,
  legal: AGENT_MODEL_ID,
  research: AGENT_MODEL_ID,
  risk: AGENT_MODEL_ID,
  screener: AGENT_MODEL_ID,
  dueDiligence: AGENT_MODEL_ID,
  entitlements: AGENT_MODEL_ID,
  design: AGENT_MODEL_ID,
  operations: AGENT_MODEL_ID,
  marketing: AGENT_MODEL_ID,
  tax: AGENT_MODEL_ID,
  marketIntel: AGENT_MODEL_ID,
  marketTrajectory: AGENT_MODEL_ID,
  capitalMarkets: AGENT_MODEL_ID,
  acquisitionUnderwriting: AGENT_MODEL_ID,
  assetManagement: AGENT_MODEL_ID,
} as const;

export type AgentModelId = typeof AGENT_MODEL_ID;
