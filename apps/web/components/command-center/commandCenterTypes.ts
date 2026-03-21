/** Daily briefing payload returned by `/api/intelligence/daily-briefing`. */
export interface CommandCenterBriefing {
  generatedAt: string;
  summary: string;
  sections: {
    newActivity: {
      label: string;
      items: string[];
    };
    needsAttention: {
      label: string;
      items: CommandCenterAttentionItem[];
    };
    automationActivity: {
      label: string;
      items: CommandCenterAutomationItem[];
    };
    pipelineSnapshot: {
      label: string;
      stages: CommandCenterPipelineStage[];
    };
  };
}

/** An individual deal or workflow that requires operator review. */
export interface CommandCenterAttentionItem {
  title: string;
  dealId: string;
  dealName: string;
  reason: string;
}

/** A recent automation event surfaced in the command center. */
export interface CommandCenterAutomationItem {
  title: string;
  status: string;
  dealName: string | null;
  createdAt: string;
}

/** Pipeline stage summary row used by the command center snapshot. */
export interface CommandCenterPipelineStage {
  status: string;
  count: number;
}

/** Deadline urgency classes returned by `/api/intelligence/deadlines`. */
export type CommandCenterUrgency = "green" | "yellow" | "red" | "black";

/** Deadline row rendered in the command center right rail. */
export interface CommandCenterDeadlineItem {
  taskId: string;
  taskTitle: string;
  dueAt: string;
  hoursUntilDue: number;
  urgency: CommandCenterUrgency;
  status: string;
  pipelineStep: number;
  dealId: string;
  dealName: string;
  dealStatus: string;
}

/** Deadline API payload used by the command center. */
export interface CommandCenterDeadlineResponse {
  deadlines: CommandCenterDeadlineItem[];
  total: number;
}

/** Portfolio deal snapshot used for activity cadence and pipeline flow. */
export interface CommandCenterPortfolioDeal {
  status: string;
  updatedAt: string;
}

/** Portfolio API payload used by the command center. */
export interface CommandCenterPortfolioResponse {
  deals: CommandCenterPortfolioDeal[];
  metrics: {
    totalDeals: number;
    byStatus: Record<string, number>;
  };
}

/** Parcel metadata shown in the opportunity radar. */
export interface CommandCenterOpportunityParcel {
  parish: string;
  parcelUid: string;
  ownerName: string;
  address: string;
  acreage: number | null;
  lat: number | null;
  lng: number | null;
}

/** Opportunity row shown in the command-center intake section. */
export interface CommandCenterOpportunityItem {
  id: string;
  matchScore: string;
  priorityScore: number;
  parcelData: CommandCenterOpportunityParcel;
  parcelId: string;
  seenAt: string | null;
  pursuedAt?: string | null;
  feedbackSignal: "new" | "seen" | "pursued" | "dismissed";
  thesis: {
    summary: string;
    whyNow: string;
    angle: string;
    nextBestAction: string;
    confidence: number;
    keyRisks: string[];
    signals: string[];
  };
  savedSearch: {
    id: string;
    name: string;
  };
  createdAt: string;
}

/** Opportunities payload returned by `/api/opportunities`. */
export interface CommandCenterOpportunityResponse {
  opportunities: CommandCenterOpportunityItem[];
  total: number;
}

/** Deadline histogram bucket used by the deadline load section. */
export interface CommandCenterDeadlineBucket {
  label: string;
  count: number;
}

/** Day-level pipeline activity bucket used by the cadence section. */
export interface CommandCenterPipelineDayBucket {
  dateKey: string;
  label: string;
  total: number;
  countByStatus: Record<string, number>;
}
