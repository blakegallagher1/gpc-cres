// Shared types and constants for Portfolio UI components

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

export interface PortfolioDeal {
  id: string;
  name: string;
  sku: SkuType;
  jurisdiction: string;
  status: DealStatus;
  triageScore: number | null;
  acreage: number;
  updatedAt: string;
  createdAt: string;
}

export interface ActivityEvent {
  id: string;
  type: "deal_created" | "status_changed" | "triage_completed" | "artifact_generated";
  description: string;
  dealName: string;
  timestamp: string;
}

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
