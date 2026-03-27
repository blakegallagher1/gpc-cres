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
    detail: 'Lead with the parcel, deal, market, or file so the run starts from a real operating context.',
  },
  {
    title: 'Ask for the deliverable',
    detail: 'Name the output you need: screen, memo, checklist, comparison, or next-step plan.',
  },
  {
    title: 'Verify before acting',
    detail: 'Use the verification rail to inspect tool activity, handoffs, and evidence gaps before acting.',
  },
];

/** Stable capability copy aligned to the current chat product contract. */
export const CHAT_WORKSPACE_CAPABILITIES: ChatWorkspaceCapability[] = [
  {
    label: 'Stateful thread',
    detail: 'Saved runs reopen from the left rail so the prompt, proof, and follow-up path stay intact across turns.',
  },
  {
    label: 'Specialist handoffs',
    detail: 'The coordinator can hand work across research, finance, risk, entitlement, diligence, and other specialists.',
  },
  {
    label: 'Tool-backed execution',
    detail: 'Live tool calls, approvals, artifacts, and map references stay visible inside the thread while the run is active.',
  },
  {
    label: 'Verification lane',
    detail: 'Confidence, missing evidence, proof checks, and tool failures accumulate in the inspector as output arrives.',
  },
];
