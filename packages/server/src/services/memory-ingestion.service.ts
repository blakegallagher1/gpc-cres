import { prisma } from '@entitlement-os/db';
import type { Prisma } from '@entitlement-os/db';
import type {
  CompData,
  MemoryIngestionRequest,
  MemoryIngestionResult,
  EntityResolutionResult,
  VolatilityClass,
} from '@entitlement-os/shared';
import {
  FACT_TYPE_VOLATILITY,
  calculateEconomicWeight,
} from '@entitlement-os/shared';
import { v4 as uuidv4 } from 'uuid';

// ============================================================================
// Entity Resolution
// ============================================================================

export class EntityResolutionService {
  /**
   * Resolve an address to an existing entity or create a new one.
   * Uses fuzzy matching, address normalization, and geocoding.
   */
  static async resolveEntity(params: {
    orgId: string;
    address: string;
    city: string;
    state: string;
    zip?: string;
  }): Promise<EntityResolutionResult> {
    const canonicalAddress = this.normalizeAddress({
      address: params.address,
      city: params.city,
      state: params.state,
      zip: params.zip,
    });

    // Try exact match first
    const existing = await prisma.internalEntity.findUnique({
      where: {
        orgId_canonicalAddress: {
          orgId: params.orgId,
          canonicalAddress,
        },
      },
    });

    if (existing) {
      return {
        entityId: existing.id,
        isNew: false,
        canonicalAddress,
        matchScore: 1.0,
        matchMethod: 'exact',
      };
    }

    // Try fuzzy match (addresses within edit distance)
    const fuzzyMatch = await this.findFuzzyMatch(params.orgId, canonicalAddress);
    if (fuzzyMatch && fuzzyMatch.score > 0.85) {
      return {
        entityId: fuzzyMatch.entityId,
        isNew: false,
        canonicalAddress: fuzzyMatch.address,
        matchScore: fuzzyMatch.score,
        matchMethod: 'fuzzy',
      };
    }

    // Create new entity
    const newEntity = await prisma.internalEntity.create({
      data: {
        id: uuidv4(),
        orgId: params.orgId,
        canonicalAddress,
        type: 'property',
      },
    });

    return {
      entityId: newEntity.id,
      isNew: true,
      canonicalAddress,
      matchScore: 1.0,
      matchMethod: 'exact',
    };
  }

  /**
   * Normalize address for canonical storage
   */
  private static normalizeAddress(params: {
    address: string;
    city: string;
    state: string;
    zip?: string;
  }): string {
    const { address, city, state, zip } = params;
    
    // Basic normalization: uppercase, trim, standardize abbrev
    let normalized = address.toUpperCase().trim()
      .replace(/\bSTREET\b/gi, 'ST')
      .replace(/\bAVENUE\b/gi, 'AVE')
      .replace(/\bBOULEVARD\b/gi, 'BLVD')
      .replace(/\bROAD\b/gi, 'RD')
      .replace(/\bDRIVE\b/gi, 'DR')
      .replace(/\bLANE\b/gi, 'LN')
      .replace(/\s+/g, ' ');

    const cityNorm = city.toUpperCase().trim();
    const stateNorm = state.toUpperCase().trim();
    const zipNorm = zip ? zip.trim().slice(0, 5) : '';

    return `${normalized}, ${cityNorm}, ${stateNorm} ${zipNorm}`.trim();
  }

  /**
   * Find fuzzy matches using Levenshtein distance
   */
  private static async findFuzzyMatch(
    orgId: string,
    canonicalAddress: string
  ): Promise<{ entityId: string; address: string; score: number } | null> {
    // Simple implementation: fetch all entities and compute similarity
    // In production, use PostgreSQL pg_trgm extension or similar
    const entities = await prisma.internalEntity.findMany({
      where: { orgId, type: 'property' },
      select: { id: true, canonicalAddress: true },
    });

    let bestMatch: { entityId: string; address: string; score: number } | null = null;

    for (const entity of entities) {
      if (!entity.canonicalAddress) continue;
      const score = this.similarity(canonicalAddress, entity.canonicalAddress);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = {
          entityId: entity.id,
          address: entity.canonicalAddress,
          score,
        };
      }
    }

    return bestMatch;
  }

  /**
   * Compute string similarity (simple Jaccard coefficient)
   */
  private static similarity(s1: string, s2: string): number {
    const set1 = new Set(s1.split(' '));
    const set2 = new Set(s2.split(' '));
    const intersection = new Set([...set1].filter((x) => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return intersection.size / union.size;
  }
}

// ============================================================================
// Memory Ingestion Service
// ============================================================================

export class MemoryIngestionService {
  /**
   * Main ingestion pipeline: takes comp data, resolves entities,
   * detects collisions, and stores in appropriate memory tables.
   */
  static async ingestComps(
    request: MemoryIngestionRequest
  ): Promise<MemoryIngestionResult> {
    const startTime = Date.now();

    const result: MemoryIngestionResult = {
      success: true,
      requestId: request.requestId,
      totalComps: request.comps.length,
      newEntities: 0,
      duplicatesSkipped: 0,
      draftsCreated: 0,
      verifiedCreated: 0,
      collisionsDetected: 0,
      innovationQueueAdded: 0,
      entityIds: [],
      draftMemoryIds: [],
      verifiedMemoryIds: [],
      collisionAlertIds: [],
      warnings: [],
      errors: [],
      processingTimeMs: 0,
    };

    try {
      for (let i = 0; i < request.comps.length; i++) {
        const comp = request.comps[i];

        try {
          // Step 1: Resolve entity
          const entityResolution = await EntityResolutionService.resolveEntity({
            orgId: request.orgId,
            address: comp.address,
            city: comp.city,
            state: comp.state,
            zip: comp.zip,
          });

          if (entityResolution.isNew) {
            result.newEntities++;
          }

          if (!result.entityIds.includes(entityResolution.entityId)) {
            result.entityIds.push(entityResolution.entityId);
          }

          // Step 2: Check for duplicates
          if (request.skipDuplicates) {
            const isDuplicate = await this.checkDuplicate({
              orgId: request.orgId,
              entityId: entityResolution.entityId,
              comp,
            });

            if (isDuplicate) {
              result.duplicatesSkipped++;
              result.warnings.push({
                compIndex: i,
                message: `Duplicate comp skipped for ${entityResolution.canonicalAddress}`,
              });
              continue;
            }
          }

          // Step 3: Decompose comp into individual facts
          const facts = this.decomposeCompToFacts(comp);

          // Step 4: Store each fact
          for (const fact of facts) {
            const economicWeight =
              request.economicWeightOverride ??
              calculateEconomicWeight({
                transactionType: comp.transactionType,
                salePrice: comp.salePrice,
                buildingSizeSf: comp.buildingSizeSf,
                transactionDate: comp.transactionDate,
              });

            const volatilityClass = FACT_TYPE_VOLATILITY[fact.factType] || 'dynamic';

            // Create event log entry
            const eventLog = await prisma.memoryEventLog.create({
              data: {
                id: uuidv4(),
                orgId: request.orgId,
                entityId: entityResolution.entityId,
                dealId: request.dealId ?? null,
                threadId: request.threadId ?? null,
                userId: request.userId ?? null,
                sourceType: request.sourceType,
                factType: fact.factType,
                payloadJson: fact.payload as Prisma.JsonObject,
                status: request.autoVerify ? 'verified' : 'draft',
                conflictFlag: false,
                requestId: request.requestId,
              },
            });

            // Store in Draft or Verified table
            if (request.autoVerify) {
              const verified = await prisma.memoryVerified.create({
                data: {
                  id: uuidv4(),
                  orgId: request.orgId,
                  entityId: entityResolution.entityId,
                  factType: fact.factType,
                  sourceType: request.sourceType,
                  economicWeight,
                  volatilityClass,
                  payloadJson: fact.payload as Prisma.JsonObject,
                  requestId: request.requestId,
                  eventLogId: eventLog.id,
                  tier: 1,
                },
              });
              result.verifiedMemoryIds.push(verified.id);
              result.verifiedCreated++;
            } else {
              const draft = await prisma.memoryDraft.create({
                data: {
                  id: uuidv4(),
                  orgId: request.orgId,
                  entityId: entityResolution.entityId,
                  factType: fact.factType,
                  sourceType: request.sourceType,
                  economicWeight,
                  volatilityClass,
                  payloadJson: fact.payload as Prisma.JsonObject,
                  conflictFlag: false,
                  requestId: request.requestId,
                  eventLogId: eventLog.id,
                  tier: 1,
                },
              });
              result.draftMemoryIds.push(draft.id);
              result.draftsCreated++;
            }

            // Step 5: Check for collisions (conflicting values)
            const collision = await this.detectCollision({
              orgId: request.orgId,
              entityId: entityResolution.entityId,
              factType: fact.factType,
              newValue: fact.payload,
            });

            if (collision) {
              result.collisionsDetected++;
              result.warnings.push({
                compIndex: i,
                message: `Collision detected for ${fact.factType} on entity ${entityResolution.canonicalAddress}`,
              });
            }

            // Step 6: Check novelty for innovation queue
            const isNovel = await this.checkNovelty({
              orgId: request.orgId,
              entityId: entityResolution.entityId,
              factType: fact.factType,
              newValue: fact.payload,
            });

            if (isNovel) {
              await prisma.innovationQueue.create({
                data: {
                  id: uuidv4(),
                  orgId: request.orgId,
                  entityId: entityResolution.entityId,
                  factType: fact.factType,
                  sourceReliability: 0.8,
                  agreementScore: 0.5,
                  noveltyReason: 'New data point significantly differs from existing facts',
                  status: 'pending',
                },
              });
              result.innovationQueueAdded++;
            }
          }
        } catch (error) {
          result.errors.push({
            compIndex: i,
            message: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } catch (error) {
      result.success = false;
      result.errors.push({
        compIndex: -1,
        message: `Global error: ${error instanceof Error ? error.message : 'Unknown'}`,
      });
    }

    result.processingTimeMs = Date.now() - startTime;
    return result;
  }

  /**
   * Check if a comp already exists in memory
   */
  private static async checkDuplicate(params: {
    orgId: string;
    entityId: string;
    comp: CompData;
  }): Promise<boolean> {
    // Check if sale_price fact exists with same date and price
    if (params.comp.transactionType === 'sale' && params.comp.salePrice) {
      const existing = await prisma.memoryVerified.findFirst({
        where: {
          orgId: params.orgId,
          entityId: params.entityId,
          factType: 'sale_price',
          payloadJson: {
            path: ['value'],
            equals: params.comp.salePrice,
          },
        },
      });

      if (existing) return true;
    }

    return false;
  }

  /**
   * Decompose a comp into individual facts
   */
  private static decomposeCompToFacts(comp: CompData): Array<{
    factType: string;
    payload: Record<string, any>;
  }> {
    const facts: Array<{ factType: string; payload: Record<string, any> }> = [];

    // Property characteristics
    if (comp.buildingSizeSf) {
      facts.push({
        factType: 'building_size_sf',
        payload: { value: comp.buildingSizeSf, unit: 'sf' },
      });
    }

    if (comp.landSizeAcres) {
      facts.push({
        factType: 'land_size_acres',
        payload: { value: comp.landSizeAcres, unit: 'acres' },
      });
    }

    if (comp.yearBuilt) {
      facts.push({
        factType: 'year_built',
        payload: { value: comp.yearBuilt },
      });
    }

    facts.push({
      factType: 'property_type',
      payload: { value: comp.propertyType },
    });

    // Transaction data
    if (comp.salePrice) {
      facts.push({
        factType: 'sale_price',
        payload: {
          value: comp.salePrice,
          date: comp.transactionDate,
          pricePerSf: comp.pricePerSf,
        },
      });
    }

    if (comp.capRate) {
      facts.push({
        factType: 'cap_rate',
        payload: {
          value: comp.capRate,
          date: comp.transactionDate,
        },
      });
    }

    if (comp.leaseRate) {
      facts.push({
        factType: 'lease_rate',
        payload: {
          value: comp.leaseRate,
          term: comp.leaseTerm,
          date: comp.transactionDate,
        },
      });
    }

    // Location/access
    if (comp.distanceToHighwayMiles !== undefined) {
      facts.push({
        factType: 'distance_to_highway',
        payload: { value: comp.distanceToHighwayMiles, unit: 'miles' },
      });
    }

    if (comp.parkingSpaces !== undefined) {
      facts.push({
        factType: 'parking_spaces',
        payload: { value: comp.parkingSpaces },
      });
    }

    // Metadata
    if (comp.brokerNotes) {
      facts.push({
        factType: 'broker_notes',
        payload: { value: comp.brokerNotes, date: comp.transactionDate },
      });
    }

    return facts;
  }

  /**
   * Detect collisions: conflicting values for the same fact
   */
  private static async detectCollision(params: {
    orgId: string;
    entityId: string;
    factType: string;
    newValue: Record<string, any>;
  }): Promise<boolean> {
    // Simplified: check if an existing verified fact has a different value
    const existing = await prisma.memoryVerified.findFirst({
      where: {
        orgId: params.orgId,
        entityId: params.entityId,
        factType: params.factType,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!existing) return false;

    // For numeric facts, check if difference > threshold
    const existingValue = (existing.payloadJson as any)?.value;
    const newVal = params.newValue.value;

    if (typeof existingValue === 'number' && typeof newVal === 'number') {
      const pctDiff = Math.abs(existingValue - newVal) / existingValue;
      return pctDiff > 0.10; // 10% threshold
    }

    // For string facts, exact match
    return existingValue !== newVal;
  }

  /**
   * Check if a new fact is novel (significantly different from consensus)
   */
  private static async checkNovelty(params: {
    orgId: string;
    entityId: string;
    factType: string;
    newValue: Record<string, any>;
  }): Promise<boolean> {
    // Simplified: if there are existing facts and new value differs significantly
    const existing = await prisma.memoryVerified.findMany({
      where: {
        orgId: params.orgId,
        entityId: params.entityId,
        factType: params.factType,
      },
    });

    if (existing.length === 0) return false;

    // For now, use same collision logic
    return this.detectCollision(params);
  }
}
