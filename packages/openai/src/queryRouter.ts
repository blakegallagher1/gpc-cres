export type SpecialistAgentKey =
  | "legal"
  | "research"
  | "risk"
  | "finance"
  | "screener"
  | "dueDiligence"
  | "entitlements"
  | "design"
  | "operations"
  | "marketing"
  | "tax"
  | "marketIntel"
  | "marketTrajectory";

export type QueryIntent =
  | "land_search"
  | "finance"
  | "legal"
  | "design"
  | "operations"
  | "marketing"
  | "risk"
  | "tax"
  | "due_diligence"
  | "entitlements"
  | "market_intel"
  | "screener"
  | "research"
  | "market_trajectory"
  | "general";

export type ProofGroup = {
  label: string;
  tools: string[];
};

export interface QueryIntentProfile {
  label: string;
  description: string;
  specialists: SpecialistAgentKey[];
  proofGroups: ProofGroup[];
  keywordTriggers: RegExp[];
}

export const SPECIALIST_AGENT_KEYS: SpecialistAgentKey[] = [
  "legal",
  "research",
  "risk",
  "finance",
  "screener",
  "dueDiligence",
  "entitlements",
  "design",
  "operations",
  "marketing",
  "tax",
  "marketIntel",
  "marketTrajectory",
];

export const SPECIALIST_LABELS: Record<SpecialistAgentKey, string> = {
  legal: "Legal",
  research: "Research",
  risk: "Risk",
  finance: "Finance",
  screener: "Deal Screener",
  dueDiligence: "Due Diligence",
  entitlements: "Entitlements",
  design: "Design",
  operations: "Operations",
  marketing: "Marketing",
  tax: "Tax",
  marketIntel: "Market Intelligence",
  marketTrajectory: "Market Trajectory",
};

const KNOWLEDGE_PROOF_GROUP: ProofGroup = {
  label: "Institutional knowledge or evidence",
  tools: ["search_knowledge_base", "search_parcels", "evidence_snapshot", "query_org_sql"],
};

const PARCEL_PROOF_GROUP: ProofGroup = {
  label: "Parcel context",
  tools: ["search_parcels", "get_parcel_details"],
};

const QUERY_INTENT_PROFILES: Record<QueryIntent, QueryIntentProfile> = {
  land_search: {
    label: "Land search",
    description: "Prioritize parcel discovery, evidence snapshots, and financial context when locating sites for development.",
    specialists: ["research", "risk", "finance"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP, PARCEL_PROOF_GROUP],
    keywordTriggers: [
      /\bfind\b.*\bland\b/, 
      /parcel/,
      /site\s+search/,
      /site.*for.*development/,
      /vacant\s+land/,
    ],
  },
  finance: {
    label: "Finance",
    description: "Finance-focused guidance backed by facts, underwriting, and knowledge assets.",
    specialists: ["finance", "legal", "risk"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP],
    keywordTriggers: [
      /\bfinance\b/, /funding/, /capital\s+stack/, /IRR/, /cash\s+flow/, /debt/, /equity/, /return\s+on\s+investment/, /underwrite/,
    ],
  },
  legal: {
    label: "Legal",
    description: "Legal work focused on contracts, zoning, and compliance with citations.",
    specialists: ["legal", "finance", "research"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP],
    keywordTriggers: [
      /agreement/, /contract/, /zoning/, /entitlement/, /title/, /deed/, /compliance/, /legal\s+review/, /law/, /ordinance/, /closure/,
    ],
  },
  design: {
    label: "Design",
    description: "Site planning, massing, and programmatic recommendations with evidence.",
    specialists: ["design", "legal", "research"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP, PARCEL_PROOF_GROUP],
    keywordTriggers: [
      /design/, /site\s+plan/, /floor\s+plan/, /massing/, /architecture/, /program\s+plan/, /layout/, /building\s+program/, /urban\s+plan/,
    ],
  },
  operations: {
    label: "Operations",
    description: "Construction schedules, sequencing, and resourcing with traceable checks.",
    specialists: ["operations", "finance", "risk"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP, PARCEL_PROOF_GROUP],
    keywordTriggers: [
      /schedule/, /timeline/, /construction/, /operations/, /phasing/, /mobilization/, /sequencing/, /work\s+plan/,
    ],
  },
  marketing: {
    label: "Marketing",
    description: "Marketing, leasing, or disposition plays grounded in data and citations.",
    specialists: ["marketing", "research", "finance"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP],
    keywordTriggers: [
      /marketing/, /leasing/, /outreach/, /rent\s+roll/, /positioning/, /brochure/, /buyers?|tenant/, /campaign/,
    ],
  },
  risk: {
    label: "Risk",
    description: "Risk assessments backed by evidence of hazards, approvals, or compliance.",
    specialists: ["risk", "research", "finance"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP],
    keywordTriggers: [
      /risk/, /hazard/, /flood/, /litigation/, /uncertainty/, /environmental/, /challenge/, /issue/, /exposure/, /mitigate/,
    ],
  },
  tax: {
    label: "Tax",
    description: "Tax strategy or IRC guidance supported by documented logic.",
    specialists: ["tax", "finance", "legal"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP],
    keywordTriggers: [
      /tax/, /IRC/, /1031/, /depreciation/, /tax\s+strategy/, /nexus/, /loss\s+carry/, /cap\s+gain/, /federal\s+tax/,
    ],
  },
  due_diligence: {
    label: "Due diligence",
    description: "Due diligence workflows that reference title, surveys, or inspections.",
    specialists: ["dueDiligence", "legal", "risk"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP, PARCEL_PROOF_GROUP],
    keywordTriggers: [
      /due\s+diligence/, /title/, /closing/, /inspection/, /survey/, /report/, /compliance\s+check/, /condition\s+assessment/,
    ],
  },
  entitlements: {
    label: "Entitlements",
    description: "Permit, zoning, or planning commission work with precedent evidence.",
    specialists: ["entitlements", "legal", "research"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP, PARCEL_PROOF_GROUP],
    keywordTriggers: [
      /entitlement/, /rezoning/, /commission/, /conditional\s+use/, /planning\s+commission/, /permit/, /application/, /zoning\s+change/,
    ],
  },
  market_intel: {
    label: "Market intelligence",
    description: "Market intel or comps with documented supporting data.",
    specialists: ["marketIntel", "research"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP],
    keywordTriggers: [
      /comparable|comps/, /market\s+data/, /market\s+intel/, /absorption/, /forecast/, /trend/, /sales\s+history/, /prices/, /analysis/,
    ],
  },
  market_trajectory: {
    label: "Market trajectory",
    description: "Neighborhood trajectory, path of progress, permit heatmaps, gentrification indicators.",
    specialists: ["marketTrajectory", "research"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP, PARCEL_PROOF_GROUP],
    keywordTriggers: [
      /\bpath\s+of\s+progress\b/, /\btrajectory\b/, /\bgentrification\b/,
      /\bpermit\s+(activity|heatmap|volume)\b/, /\bneighborhood\s+growth\b/,
      /\bspatial\s+momentum\b/, /\bappreciat(ing|ion)\b/, /\bzip\s*code\s+70801\b/,
    ],
  },
  screener: {
    label: "Deal screener",
    description: "Deal screening work that regularly hits parcel scores and knowledge sources.",
    specialists: ["screener", "research", "risk", "finance"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP, PARCEL_PROOF_GROUP],
    keywordTriggers: [
      /screen/, /screener/, /triage/, /underwrite/, /deal\s+screen/, /deal\s+score/, /evaluate\s+this\s+deal/, /deal\s+fit/,
    ],
  },
  research: {
    label: "Research",
    description: "Data-driven research with citations and shared knowledge.",
    specialists: ["research", "risk"],
    proofGroups: [KNOWLEDGE_PROOF_GROUP],
    keywordTriggers: [
      /research/, /analysis/, /data\s+study/, /benchmark/, /intelligence\s+report/, /investigate/, /study\s+the\s+market/,
    ],
  },
  general: {
    label: "General",
    description: "Default routing when no other query intent can be determined.",
    specialists: SPECIALIST_AGENT_KEYS,
    proofGroups: [],
    keywordTriggers: [],
  },
};

const QUERY_INTENT_ORDER: QueryIntent[] = [
  "land_search",
  "finance",
  "legal",
  "design",
  "operations",
  "marketing",
  "risk",
  "tax",
  "due_diligence",
  "entitlements",
  "market_intel",
  "market_trajectory",
  "screener",
  "research",
  "general",
];

export function getQueryIntentProfile(intent: QueryIntent): QueryIntentProfile {
  return QUERY_INTENT_PROFILES[intent] ?? QUERY_INTENT_PROFILES.general;
}

export function inferQueryIntentFromText(text?: string): QueryIntent {
  if (!text) return "general";
  const normalized = text.toLowerCase();
  for (const intent of QUERY_INTENT_ORDER) {
    if (intent === "general") continue;
    const profile = QUERY_INTENT_PROFILES[intent];
    if (profile.keywordTriggers.some((pattern) => pattern.test(normalized))) {
      return intent;
    }
  }
  return "general";
}

export function buildPlannerContext(intent: QueryIntent): string {
  const profile = getQueryIntentProfile(intent);
  const proofLines = profile.proofGroups.map((group) =>
    `- ${group.label}: reference ${group.tools.join(", ")}`,
  );
  const proofContext = proofLines.length > 0 ? `Required proof groups:
${proofLines.join("\n")}` : "";

  return [
    `Planner guardrail for ${profile.label}: produce a concise execution plan with numbered steps and tie each step back to the most relevant evidence sources or tools.`,
    proofContext,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function getSpecialistsForIntent(intent: QueryIntent): SpecialistAgentKey[] {
  return getQueryIntentProfile(intent).specialists;
}

export function getProofGroupsForIntent(intent: QueryIntent): ProofGroup[] {
  return getQueryIntentProfile(intent).proofGroups;
}

export interface ProofViolation {
  group: ProofGroup;
  missingTools: string[];
}

export function evaluateProofCompliance(
  intent: QueryIntent,
  invokedTools: Set<string>,
): ProofViolation[] {
  const profile = getQueryIntentProfile(intent);
  const violations: ProofViolation[] = [];

  for (const group of profile.proofGroups) {
    const toolNeeded = group.tools.some((tool) => invokedTools.has(tool));
    if (!toolNeeded) {
      violations.push({
        group,
        missingTools: group.tools.filter((tool) => !invokedTools.has(tool)),
      });
    }
  }

  return violations;
}
