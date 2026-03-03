import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@entitlement-os/db';
import { MemoryIngestionService } from '@/lib/services/memoryIngestion.service';
import { MemoryIngestionRequestSchema } from '@entitlement-os/shared';
import { resolveAuth } from '@/lib/auth/resolveAuth';
import { extractParishFromAddress } from '@/lib/services/compToMarket';
import { addMarketDataPoint } from '@/lib/services/marketMonitor.service';

/**
 * POST /api/memory/ingest
 * 
 * Ingest commercial real estate comps into the memory system.
 * Handles entity resolution, duplicate detection, collision detection,
 * and stores in draft or verified tables based on autoVerify flag.
 */
export async function POST(request: NextRequest) {
  try {
    // Auth check
    const authResult = await resolveAuth(request);
    if (!authResult) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { userId, orgId } = authResult;

    // Parse request body
    const body = await request.json();
    
    // Inject userId, orgId, and generate requestId if not provided
    const enrichedBody = {
      ...body,
      userId,
      orgId: body.orgId || orgId,
      requestId: body.requestId || crypto.randomUUID(),
    };

    // Validate request
    const validationResult = MemoryIngestionRequestSchema.safeParse(enrichedBody);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: validationResult.error.issues,
        },
        { status: 400 }
      );
    }

    const ingestionRequest = validationResult.data;

    // Verify user has access to the requested org
    if (ingestionRequest.orgId !== orgId) {
      const membership = await prisma.orgMembership.findFirst({
        where: {
          orgId: ingestionRequest.orgId,
          userId,
        },
      });

      if (!membership) {
        return NextResponse.json(
          { error: 'Forbidden: User not member of org' },
          { status: 403 }
        );
      }
    }

    // Execute ingestion
    const result = await MemoryIngestionService.ingestComps(ingestionRequest);

    // Bridge verified comps to Market Intel page (MarketDataPoint table)
    if (ingestionRequest.autoVerify && result.verifiedCreated > 0) {
      const erroredIndexes = new Set(result.errors.map((e) => e.compIndex));
      for (let i = 0; i < ingestionRequest.comps.length; i++) {
        if (erroredIndexes.has(i)) continue;
        const comp = ingestionRequest.comps[i];
        const fullAddress = [comp.address, comp.city, `${comp.state} ${comp.zip ?? ""}`]
          .filter(Boolean)
          .join(", ")
          .trim();
        const parish =
          extractParishFromAddress(fullAddress) ?? "East Baton Rouge";
        const data: Record<string, unknown> = {
          address: fullAddress || null,
          sale_price: comp.salePrice ?? null,
          price_psf: comp.pricePerSf ?? null,
          cap_rate: comp.capRate ?? null,
          property_type: comp.propertyType ?? null,
          buyer: comp.buyer ?? null,
          seller: comp.seller ?? null,
        };
        const observedAt = comp.transactionDate
          ? new Date(comp.transactionDate)
          : undefined;
        addMarketDataPoint(
          parish,
          "comp_sale",
          `memory:${ingestionRequest.sourceType}`,
          data,
          observedAt
        ).catch(() => {});
      }
    }

    // Return result
    return NextResponse.json(result, { status: result.success ? 200 : 207 });
  } catch (error) {
    console.error('[Memory Ingest API Error]', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
