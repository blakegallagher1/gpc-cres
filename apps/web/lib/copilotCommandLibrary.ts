export type CopilotCommandCategory =
  | "analytics"
  | "documentation"
  | "market"
  | "operations";

export type CopilotCommand = {
  id: string;
  label: string;
  description: string;
  agent: string;
  prompt: string;
  category: CopilotCommandCategory;
};

export const DEFAULT_ACTIONS: CopilotCommand[] = [
  {
    id: "underwrite",
    label: "Run Full Underwriting",
    description: "NOI, DSCR, IRR, sensitivities",
    agent: "finance",
    prompt:
      "Run a full underwriting summary with NOI, DSCR, IRR, debt sizing, and key risks.",
    category: "analytics",
  },
  {
    id: "loi",
    label: "Generate LOI Draft",
    description: "IC-ready LOI terms",
    agent: "legal",
    prompt:
      "Draft a concise LOI with price, diligence timeline, closing terms, and contingencies.",
    category: "documentation",
  },
  {
    id: "comps",
    label: "Summarize Comps",
    description: "Closest sales + pricing context",
    agent: "research",
    prompt:
      "Summarize the top comps with pricing, cap rates, and supporting rationale.",
    category: "market",
  },
  {
    id: "dd",
    label: "Create DD Checklist",
    description: "Phase-based checklist",
    agent: "operations",
    prompt:
      "Create a due diligence checklist with owners, SLAs, and dependencies.",
    category: "operations",
  },
];

export const COMMAND_LIBRARY: CopilotCommand[] = [
  ...DEFAULT_ACTIONS,
  {
    id: "underwrite-quick",
    label: "Underwriting Snapshot",
    description: "3-metric underwriting snapshot",
    agent: "finance",
    prompt: "Give a fast underwriting snapshot with DSCR, leverage, and cap rate sensitivity only.",
    category: "analytics",
  },
  {
    id: "loi-qa",
    label: "Buyer Outreach Memo",
    description: "Concise IC-ready outreach draft",
    agent: "legal",
    prompt:
      "Draft a concise buyer outreach memo covering property highlights, risks, and timeline assumptions.",
    category: "documentation",
  },
  {
    id: "comps-intra",
    label: "Local Comp Grid",
    description: "Regional comps comparison",
    agent: "research",
    prompt:
      "Compare 5 recent comparable sales in the Baton Rouge metro with cap rates and per-acre pricing.",
    category: "market",
  },
  {
    id: "dd-risk",
    label: "Risk Checklist",
    description: "Environmental and legal risk focus",
    agent: "operations",
    prompt:
      "Create an environmental and legal risk checklist with clear sequencing and owner assignment suggestions.",
    category: "operations",
  },
];
