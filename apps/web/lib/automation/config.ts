export const AUTOMATION_CONFIG = Object.freeze({
  enrichment: Object.freeze({
    autoEnrichMinConfidence: 0.9,
    reviewMinConfidence: 0.5,
    maxAttemptsPerParcel: 1,
  }),
  triage: Object.freeze({
    maxRunsPerDealPerDay: 1,
    killConfirmationWindowHours: 48,
  }),
  taskExecution: Object.freeze({
    maxConcurrentPerDeal: 5,
    timeoutMs: 300_000,
    minOutputLength: 50,
    humanOnlyKeywords: Object.freeze(["call", "meet", "negotiate", "sign", "schedule"] as const),
  }),
  intake: Object.freeze({
    maxAutoCreatedPerDay: 10,
    vetoWindowHours: 24,
    coveredParishes: Object.freeze([
      "East Baton Rouge",
      "Ascension",
      "Livingston",
      "West Baton Rouge",
      "Iberville",
    ] as const),
  }),
  advancement: Object.freeze({
    reminderAfterHours: 48,
  }),
  buyerOutreach: Object.freeze({
    maxEmailsPerDealPerWeek: 20,
    coolOffDays: 15,
    neverAutoSend: true as const,
  }),
  documents: Object.freeze({
    maxFileSizeMb: 50,
    maxBatchSize: 10,
    classificationMinConfidence: 0.7,
  }),
  financialInit: Object.freeze({
    defaultCoverageRatio: 0.3,
    coverageRatioBySku: Object.freeze({
      SMALL_BAY_FLEX: 0.35,
      OUTDOOR_STORAGE: 0.4,
      TRUCK_PARKING: 0.5,
    } as const),
    marketCapRateLookbackDays: 120,
    defaultExitCapRatePct: 7.5,
    defaultHoldYears: 5,
  }),
  deadlineMonitoring: Object.freeze({
    escalationAgeDays: 30,
    dedupeWindowHours: 24,
    notificationTaskDueHours: 24,
  }),
  marketMonitoring: Object.freeze({
    capRateShiftBps: 50,
    rateEnvironmentShiftBps: 100,
    lookbackDays: 30,
    dedupeWindowHours: 24,
  }),
  knowledgeCapture: Object.freeze({
    dedupeBeforeWrite: true as const,
  }),
  hostedTools: Object.freeze({
    webSearchMaxCallsPerConversation: 10,
  }),
  intelligenceKpi: Object.freeze({
    lookbackMonths: 36,
    snapshotLookbackMonths: 72,
    minSampleSize: 12,
    minMatchedPredictions: 8,
    maxMedianTimelineMaeDays: 30,
    maxCalibrationGapAbs: 0.12,
    alertCooldownHours: 24,
  }),
  entitlementAutopilot: Object.freeze({
    lookbackMonths: 36,
    snapshotLookbackMonths: 72,
    minSampleSize: 12,
    minMatchedPredictions: 8,
    maxMedianTimelineMaeDays: 30,
    maxCalibrationGapAbs: 0.12,
    minApprovalProbability: 0.62,
    minStrategySampleSize: 6,
    approvalWeight: 0.72,
    speedWeight: 0.28,
    defaultTaskDueInDays: 5,
  }),
});

export type AutomationConfig = typeof AUTOMATION_CONFIG;
