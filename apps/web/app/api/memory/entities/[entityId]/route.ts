import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@entitlement-os/db';
import { resolveAuth } from '@/lib/auth/resolveAuth';

/**
 * GET /api/memory/entities/[entityId]
 * 
 * Retrieve all memory facts for a specific entity (property).
 * Returns drafts, verified facts, and collision alerts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ entityId: string }> }
) {
  try {
    const authResult = await resolveAuth();
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, orgId } = authResult;
    const { entityId } = await params;

    // Fetch entity with org check
    const entity = await prisma.internalEntity.findUnique({
      where: { id: entityId },
    });

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 }
      );
    }

    // Verify entity belongs to user's org
    if (entity.orgId !== orgId) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Fetch all memory facts
    const [drafts, verified, collisionAlerts, eventLogs] = await Promise.all([
      prisma.memoryDraft.findMany({
        where: { entityId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.memoryVerified.findMany({
        where: { entityId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.entityCollisionAlert.findMany({
        where: {
          OR: [
            { entityIdA: entityId },
            { entityIdB: entityId },
          ],
          status: 'pending',
        },
      }),
      prisma.memoryEventLog.findMany({
        where: { entityId },
        orderBy: { timestamp: 'desc' },
        take: 50,
      }),
    ]);

    return NextResponse.json({
      entity,
      drafts,
      verified,
      collisionAlerts,
      eventLogs,
    });
  } catch (error) {
    console.error('[Memory Entity API Error]', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
