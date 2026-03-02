import { z } from 'zod';

// ============================================================================
// Core Memory Types
// ============================================================================

export const CompSourceSchema = z.enum([
  'loopnet',
  'costar',
  'crexi',
  'rca',
  'broker_package',
  'tax_assessor',
  'manual_entry',
  'api_integration',
]);

export type CompSource = z.infer<typeof CompSourceSchema>;

export const CompPropertyTypeSchema = z.enum([
  'industrial_flex',
  'cold_storage',
  'outdoor_storage',
  'truck_terminal',
  'distribution_center',
  'warehouse',
  'manufacturing',
  'mixed_use',
]);

export type CompPropertyType = z.infer<typeof CompPropertyTypeSchema>;

export const CompTransactionTypeSchema = z.enum([
  'sale',
  'lease',
  'listing',
]);

export type CompTransactionType = z.infer<typeof CompTransactionTypeSchema>;

// ============================================================================
// Comp Data Schema
// ============================================================================

export const CompDataSchema = z.object({
  // Core identification
  address: z.string(),
  city: z.string(),
  state: z.string(),
  zip: z.string().optional(),
  
  // Property characteristics
  propertyType: CompPropertyTypeSchema,
  buildingSizeSf: z.number().positive().optional(),
  landSizeAcres: z.number().positive().optional(),
  yearBuilt: z.number().int().min(1800).max(2100).optional(),
  
  // Transaction details
  transactionType: CompTransactionTypeSchema,
  transactionDate: z.string().datetime().optional(), // ISO 8601
  salePrice: z.number().positive().optional(),
  pricePerSf: z.number().positive().optional(),
  
  // Lease-specific
  leaseRate: z.number().positive().optional(), // per SF per year
  leaseTerm: z.number().int().positive().optional(), // months
  
  // Cap rate / yield
  capRate: z.number().min(0).max(1).optional(), // 0.05 = 5%
  
  // Location quality
  distanceToHighwayMiles: z.number().nonnegative().optional(),
  parkingSpaces: z.number().int().nonnegative().optional(),
  
  // Additional metadata
  buyer: z.string().optional(),
  seller: z.string().optional(),
  brokerNotes: z.string().optional(),
  
  // Data source tracking
  source: CompSourceSchema,
  sourceDocumentId: z.string().optional(),
  sourceUrl: z.string().url().optional(),
});

export type CompData = z.infer<typeof CompDataSchema>;

// ============================================================================
// Memory Ingestion Request
// ============================================================================

export const MemoryIngestionRequestSchema = z.object({
  orgId: z.string().uuid(),
  userId: z.string().uuid().optional(),
  dealId: z.string().uuid().optional(),
  threadId: z.string().optional(),
  requestId: z.string().uuid(),
  
  // Source metadata
  sourceType: z.enum([
    'excel_upload',
    'csv_upload',
    'api_scrape',
    'broker_email',
    'manual_entry',
  ]),
  sourceFile: z.string().optional(),
  
  // The actual comp records
  comps: z.array(CompDataSchema).min(1),
  
  // Processing options
  autoVerify: z.boolean().default(false),
  skipDuplicates: z.boolean().default(true),
  economicWeightOverride: z.number().min(0).max(1).optional(),
});

export type MemoryIngestionRequest = z.infer<typeof MemoryIngestionRequestSchema>;

// ============================================================================
// Memory Storage Result
// ============================================================================

export const MemoryIngestionResultSchema = z.object({
  success: z.boolean(),
  requestId: z.string().uuid(),
  
  // Stats
  totalComps: z.number().int().nonnegative(),
  newEntities: z.number().int().nonnegative(),
  duplicatesSkipped: z.number().int().nonnegative(),
  draftsCreated: z.number().int().nonnegative(),
  verifiedCreated: z.number().int().nonnegative(),
  collisionsDetected: z.number().int().nonnegative(),
  innovationQueueAdded: z.number().int().nonnegative(),
  
  // Detailed results
  entityIds: z.array(z.string().uuid()),
  draftMemoryIds: z.array(z.string().uuid()),
  verifiedMemoryIds: z.array(z.string().uuid()),
  collisionAlertIds: z.array(z.string().uuid()),
  
  // Errors/warnings
  warnings: z.array(z.object({
    compIndex: z.number(),
    message: z.string(),
  })),
  errors: z.array(z.object({
    compIndex: z.number(),
    message: z.string(),
  })),
  
  // Timing
  processingTimeMs: z.number(),
});

export type MemoryIngestionResult = z.infer<typeof MemoryIngestionResultSchema>;

// ============================================================================
// Volatility & Economic Weighting
// ============================================================================

export const VolatilityClassSchema = z.enum([
  'core',      // Very stable: property address, size, year built
  'stable',    // Somewhat stable: property type, parking, access
  'dynamic',   // Changes frequently: price, cap rate, lease terms
  'volatile',  // Highly variable: market sentiment, broker opinion
]);

export type VolatilityClass = z.infer<typeof VolatilityClassSchema>;

// Mapping of fact types to their volatility classification
export const FACT_TYPE_VOLATILITY: Record<string, VolatilityClass> = {
  property_address: 'core',
  building_size_sf: 'core',
  land_size_acres: 'core',
  year_built: 'core',
  property_type: 'stable',
  parking_spaces: 'stable',
  distance_to_highway: 'stable',
  sale_price: 'dynamic',
  price_per_sf: 'dynamic',
  cap_rate: 'dynamic',
  lease_rate: 'dynamic',
  lease_term: 'dynamic',
  transaction_date: 'dynamic',
  broker_notes: 'volatile',
};

// Economic weight based on property type and deal stage
export function calculateEconomicWeight(params: {
  transactionType: CompTransactionType;
  salePrice?: number;
  buildingSizeSf?: number;
  transactionDate?: string;
}): number {
  let weight = 0.5; // Base weight
  
  // Actual sales are more valuable than listings
  if (params.transactionType === 'sale') {
    weight += 0.3;
  } else if (params.transactionType === 'lease') {
    weight += 0.2;
  }
  
  // Recent transactions are more valuable
  if (params.transactionDate) {
    const monthsAgo = (Date.now() - new Date(params.transactionDate).getTime()) / (1000 * 60 * 60 * 24 * 30);
    if (monthsAgo < 6) weight += 0.15;
    else if (monthsAgo < 12) weight += 0.10;
    else if (monthsAgo < 24) weight += 0.05;
  }
  
  // Larger transactions carry more weight
  if (params.salePrice && params.salePrice > 5_000_000) {
    weight += 0.05;
  }
  
  return Math.min(1.0, weight);
}

// ============================================================================
// Entity Resolution
// ============================================================================

export const EntityResolutionResultSchema = z.object({
  entityId: z.string().uuid(),
  isNew: z.boolean(),
  canonicalAddress: z.string(),
  matchScore: z.number().min(0).max(1),
  matchMethod: z.enum(['exact', 'fuzzy', 'geocode', 'parcel_id']),
});

export type EntityResolutionResult = z.infer<typeof EntityResolutionResultSchema>;

// ============================================================================
// Memory Event Log Entry
// ============================================================================

export const MemoryEventLogEntrySchema = z.object({
  orgId: z.string().uuid(),
  entityId: z.string().uuid(),
  dealId: z.string().uuid().optional(),
  threadId: z.string().optional(),
  userId: z.string().uuid().optional(),
  
  sourceType: z.string(),
  factType: z.string(),
  payloadJson: z.record(z.string(), z.any()),
  
  status: z.enum(['draft', 'verified', 'rejected', 'pending_review']),
  conflictFlag: z.boolean().default(false),
  
  requestId: z.string(),
  modelTraceId: z.string().optional(),
  toolName: z.string().optional(),
  
  latencyMs: z.number().int().nonnegative().optional(),
  tokenUsage: z.number().int().nonnegative().optional(),
  costUsd: z.number().nonnegative().optional(),
  
  causalMetadata: z.record(z.string(), z.any()).optional(),
});

export type MemoryEventLogEntry = z.infer<typeof MemoryEventLogEntrySchema>;
