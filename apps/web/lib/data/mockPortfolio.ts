// Mock data for Portfolio Analytics dashboard

export type DealStatus =
  | "INTAKE"
  | "TRIAGE_DONE"
  | "PREAPP"
  | "CONCEPT"
  | "NEIGHBORS"
  | "SUBMITTED"
  | "HEARING"
  | "APPROVED"
  | "EXIT_MARKETED"
  | "EXITED"
  | "KILLED";

export type SkuType = "SMALL_BAY_FLEX" | "OUTDOOR_STORAGE" | "TRUCK_PARKING";

export interface MockDeal {
  id: string;
  name: string;
  sku: SkuType;
  jurisdiction: string;
  status: DealStatus;
  triageScore: number | null;
  acreage: number;
  estimatedValue: number;
  lastActivity: string;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  type: "deal_created" | "status_changed" | "triage_completed" | "artifact_generated";
  description: string;
  dealName: string;
  timestamp: string;
}

export const mockDeals: MockDeal[] = [
  {
    id: "d1",
    name: "Airline Hwy Flex Park",
    sku: "SMALL_BAY_FLEX",
    jurisdiction: "EBR",
    status: "CONCEPT",
    triageScore: 82,
    acreage: 12.4,
    estimatedValue: 850_000,
    lastActivity: "2026-02-04T18:30:00Z",
    createdAt: "2026-01-15T10:00:00Z",
  },
  {
    id: "d2",
    name: "Hoo Shoo Too Rd Storage",
    sku: "OUTDOOR_STORAGE",
    jurisdiction: "Ascension",
    status: "SUBMITTED",
    triageScore: 74,
    acreage: 8.2,
    estimatedValue: 320_000,
    lastActivity: "2026-02-03T14:15:00Z",
    createdAt: "2026-01-10T09:00:00Z",
  },
  {
    id: "d3",
    name: "Greenwell Springs Truck Terminal",
    sku: "TRUCK_PARKING",
    jurisdiction: "EBR",
    status: "HEARING",
    triageScore: 91,
    acreage: 22.0,
    estimatedValue: 650_000,
    lastActivity: "2026-02-04T09:00:00Z",
    createdAt: "2025-12-20T08:00:00Z",
  },
  {
    id: "d4",
    name: "Walker South Industrial",
    sku: "SMALL_BAY_FLEX",
    jurisdiction: "Livingston",
    status: "TRIAGE_DONE",
    triageScore: 68,
    acreage: 5.7,
    estimatedValue: 410_000,
    lastActivity: "2026-02-02T16:45:00Z",
    createdAt: "2026-01-25T11:00:00Z",
  },
  {
    id: "d5",
    name: "Plank Rd Flex Suites",
    sku: "SMALL_BAY_FLEX",
    jurisdiction: "EBR",
    status: "APPROVED",
    triageScore: 88,
    acreage: 15.1,
    estimatedValue: 920_000,
    lastActivity: "2026-01-28T12:00:00Z",
    createdAt: "2025-11-05T14:00:00Z",
  },
  {
    id: "d6",
    name: "Denham Springs Yard",
    sku: "OUTDOOR_STORAGE",
    jurisdiction: "Livingston",
    status: "INTAKE",
    triageScore: null,
    acreage: 6.3,
    estimatedValue: 180_000,
    lastActivity: "2026-02-04T21:00:00Z",
    createdAt: "2026-02-04T21:00:00Z",
  },
  {
    id: "d7",
    name: "Port Allen Logistics Hub",
    sku: "TRUCK_PARKING",
    jurisdiction: "EBR",
    status: "PREAPP",
    triageScore: 76,
    acreage: 18.5,
    estimatedValue: 520_000,
    lastActivity: "2026-02-01T10:30:00Z",
    createdAt: "2026-01-20T09:00:00Z",
  },
  {
    id: "d8",
    name: "Gonzales Commerce Park",
    sku: "SMALL_BAY_FLEX",
    jurisdiction: "Ascension",
    status: "NEIGHBORS",
    triageScore: 79,
    acreage: 10.8,
    estimatedValue: 680_000,
    lastActivity: "2026-02-03T08:00:00Z",
    createdAt: "2026-01-08T15:00:00Z",
  },
  {
    id: "d9",
    name: "Burbank Dr Storage Depot",
    sku: "OUTDOOR_STORAGE",
    jurisdiction: "EBR",
    status: "EXIT_MARKETED",
    triageScore: 65,
    acreage: 4.2,
    estimatedValue: 145_000,
    lastActivity: "2026-01-30T17:00:00Z",
    createdAt: "2025-10-12T10:00:00Z",
  },
  {
    id: "d10",
    name: "Prairieville Flex Center",
    sku: "SMALL_BAY_FLEX",
    jurisdiction: "Ascension",
    status: "EXITED",
    triageScore: 83,
    acreage: 14.3,
    estimatedValue: 1_100_000,
    lastActivity: "2026-01-15T14:00:00Z",
    createdAt: "2025-08-20T08:00:00Z",
  },
  {
    id: "d11",
    name: "Highland Rd Pad Site",
    sku: "SMALL_BAY_FLEX",
    jurisdiction: "EBR",
    status: "KILLED",
    triageScore: 42,
    acreage: 2.5,
    estimatedValue: 0,
    lastActivity: "2026-01-20T11:00:00Z",
    createdAt: "2026-01-18T09:00:00Z",
  },
  {
    id: "d12",
    name: "Coursey Blvd Truck Lot",
    sku: "TRUCK_PARKING",
    jurisdiction: "EBR",
    status: "INTAKE",
    triageScore: null,
    acreage: 27.5,
    estimatedValue: 400_000,
    lastActivity: "2026-02-05T08:00:00Z",
    createdAt: "2026-02-05T08:00:00Z",
  },
];

export const mockActivityEvents: ActivityEvent[] = [
  {
    id: "e1",
    type: "deal_created",
    description: "New deal created",
    dealName: "Coursey Blvd Truck Lot",
    timestamp: "2026-02-05T08:00:00Z",
  },
  {
    id: "e2",
    type: "status_changed",
    description: "Status changed to CONCEPT",
    dealName: "Airline Hwy Flex Park",
    timestamp: "2026-02-04T18:30:00Z",
  },
  {
    id: "e3",
    type: "artifact_generated",
    description: "Triage PDF generated",
    dealName: "Denham Springs Yard",
    timestamp: "2026-02-04T21:00:00Z",
  },
  {
    id: "e4",
    type: "triage_completed",
    description: "Triage completed - score 82",
    dealName: "Airline Hwy Flex Park",
    timestamp: "2026-02-04T15:00:00Z",
  },
  {
    id: "e5",
    type: "status_changed",
    description: "Status changed to HEARING",
    dealName: "Greenwell Springs Truck Terminal",
    timestamp: "2026-02-04T09:00:00Z",
  },
  {
    id: "e6",
    type: "status_changed",
    description: "Status changed to SUBMITTED",
    dealName: "Hoo Shoo Too Rd Storage",
    timestamp: "2026-02-03T14:15:00Z",
  },
  {
    id: "e7",
    type: "status_changed",
    description: "Status changed to NEIGHBORS",
    dealName: "Gonzales Commerce Park",
    timestamp: "2026-02-03T08:00:00Z",
  },
  {
    id: "e8",
    type: "triage_completed",
    description: "Triage completed - score 68",
    dealName: "Walker South Industrial",
    timestamp: "2026-02-02T16:45:00Z",
  },
  {
    id: "e9",
    type: "artifact_generated",
    description: "Exit Package PDF generated",
    dealName: "Burbank Dr Storage Depot",
    timestamp: "2026-02-01T12:00:00Z",
  },
  {
    id: "e10",
    type: "status_changed",
    description: "Status changed to PREAPP",
    dealName: "Port Allen Logistics Hub",
    timestamp: "2026-02-01T10:30:00Z",
  },
];

export const mockPortfolioMetrics = {
  totalDeals: mockDeals.filter((d) => d.status !== "KILLED" && d.status !== "EXITED").length,
  totalAcreage: mockDeals
    .filter((d) => d.status !== "KILLED" && d.status !== "EXITED")
    .reduce((sum, d) => sum + d.acreage, 0),
  pipelineValue: mockDeals
    .filter((d) => d.status !== "KILLED" && d.status !== "EXITED")
    .reduce((sum, d) => sum + d.estimatedValue, 0),
  avgTriageScore: Math.round(
    mockDeals
      .filter((d) => d.triageScore !== null)
      .reduce((sum, d) => sum + (d.triageScore ?? 0), 0) /
      mockDeals.filter((d) => d.triageScore !== null).length
  ),
  dealsChange: 2,
  acreageChange: 8.5,
  pipelineChange: 12,
  scoreChange: -3,
};

export const PIPELINE_STAGES: { key: DealStatus; label: string; color: string }[] = [
  { key: "INTAKE", label: "Intake", color: "#6366f1" },
  { key: "TRIAGE_DONE", label: "Triaged", color: "#8b5cf6" },
  { key: "PREAPP", label: "Pre-App", color: "#a78bfa" },
  { key: "CONCEPT", label: "Concept", color: "#3b82f6" },
  { key: "NEIGHBORS", label: "Neighbors", color: "#06b6d4" },
  { key: "SUBMITTED", label: "Submitted", color: "#14b8a6" },
  { key: "HEARING", label: "Hearing", color: "#22c55e" },
  { key: "APPROVED", label: "Approved", color: "#16a34a" },
  { key: "EXIT_MARKETED", label: "Exit Mkt", color: "#eab308" },
  { key: "EXITED", label: "Exited", color: "#f97316" },
  { key: "KILLED", label: "Killed", color: "#ef4444" },
];

export const SKU_CONFIG: Record<SkuType, { label: string; color: string; bgColor: string }> = {
  SMALL_BAY_FLEX: { label: "Small Bay Flex", color: "#3b82f6", bgColor: "bg-blue-500/10" },
  OUTDOOR_STORAGE: { label: "Outdoor Storage", color: "#22c55e", bgColor: "bg-green-500/10" },
  TRUCK_PARKING: { label: "Truck Parking", color: "#f59e0b", bgColor: "bg-amber-500/10" },
};

export const JURISDICTION_CONFIG: Record<string, { label: string; color: string }> = {
  EBR: { label: "East Baton Rouge", color: "#6366f1" },
  Ascension: { label: "Ascension", color: "#3b82f6" },
  Livingston: { label: "Livingston", color: "#22c55e" },
};
