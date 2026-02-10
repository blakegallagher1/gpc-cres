// Shared types for Wealth UI components

export interface WealthEntity {
  id: string;
  name: string;
  type: "LLC" | "Trust" | "Corp" | "Individual";
  parentId: string | null;
  ownershipPct: number;
  taxId?: string;
  state: string;
  associatedDealIds: string[];
}

export interface CashFlowItem {
  label: string;
  amount: number;
  type: "revenue" | "expense" | "subtotal" | "distribution";
}

export interface TaxAlert {
  id: string;
  type: "1031_exchange" | "cost_seg" | "oz_deadline" | "depreciation_recapture" | string;
  title: string;
  description: string;
  severity: "critical" | "warning" | "info";
  deadline?: string;
  daysRemaining?: number;
  entityName: string;
  estimatedImpact?: number;
}

export interface DepreciationRow {
  propertyName: string;
  entityName: string;
  basis: number;
  method: string;
  yearPlaced: number;
  annualDeduction: number;
  accumulatedDepr: number;
  remainingBasis: number;
}

export interface Exchange1031 {
  id: string;
  propertyRelinquished: string;
  saleDate: string;
  salePrice: number;
  identificationDeadline: string;
  closingDeadline: string;
  status: "identification" | "closing" | "completed" | "expired";
  candidateProperties: string[];
  gain: number;
}
