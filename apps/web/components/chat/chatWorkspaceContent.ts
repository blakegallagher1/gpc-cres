export interface ChatWorkspaceStep {
  title: string;
  detail: string;
}

export interface ChatWorkspaceCapability {
  label: string;
  detail: string;
}

/** Guidance used across the chat workspace to keep prompts operator-grade. */
export const CHAT_WORKSPACE_STEPS: ChatWorkspaceStep[] = [
  {
    title: 'Set the scope',
    detail: 'Lead with a parcel, address, deal, market, or uploaded file so the agent can anchor the run.',
  },
  {
    title: 'Ask for the deliverable',
    detail: 'Request a screen, memo, checklist, comparison, or action plan instead of a vague answer.',
  },
  {
    title: 'Verify before acting',
    detail: 'Inspect tool activity, handoffs, evidence gaps, and cited sources before making a decision.',
  },
];

/** Stable capability copy aligned to the current chat product contract. */
export const CHAT_WORKSPACE_CAPABILITIES: ChatWorkspaceCapability[] = [
  {
    label: 'Stateful thread',
    detail: 'Saved runs reopen from the left rail so the operating context stays intact across turns.',
  },
  {
    label: 'Specialist handoffs',
    detail: 'The coordinator can delegate work to research, finance, risk, entitlements, diligence, and other specialists.',
  },
  {
    label: 'Tool-backed execution',
    detail: 'Live tool calls, approvals, artifacts, and map references surface in the thread while the run is active.',
  },
  {
    label: 'Verification lane',
    detail: 'Confidence, missing evidence, proof checks, and tool failures accumulate in the inspector as output arrives.',
  },
];