import { NextRequest, NextResponse } from 'next/server';
import { db } from '@gpc/db';
import { MemoryIngestionService } from '@gpc/server/services/memory-ingestion.service';
import { MemoryIngestionRequestSchema } from '@gpc/shared/types/memory';
import { v4 as uuidv4 } from 'uuid';
import { auth } from '@clerk/nextjs/server';

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
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse request body
    const body = await request.json();
    
    // Inject userId and generate requestId if not provided
    const enrichedBody = {
      ...body,
      userId,
      requestId: body.requestId || uuidv4(),
    };

    // Validate request
    const validationResult = MemoryIngestionRequestSchema.safeParse(enrichedBody);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: 'Invalid request',
          details: validationResult.error.errors,
        },
        { status: 400 }
      );
    }

    const ingestionRequest = validationResult.data;

    // Verify user has access to org
    const membership = await db.orgMembership.findUnique({
      where: {
        orgId_userId: {
          orgId: ingestionRequest.orgId,
          userId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Forbidden: User not member of org' },
        { status: 403 }
      );
    }

    // Execute ingestion
    const result = await MemoryIngestionService.ingestComps(ingestionRequest);

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
