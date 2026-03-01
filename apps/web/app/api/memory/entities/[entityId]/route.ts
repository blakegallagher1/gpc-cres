import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@gpc/db';

/**
 * GET /api/memory/entities/[entityId]
 * 
 * Retrieve all memory facts for a specific entity (property).
 * Returns drafts, verified facts, and collision alerts.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { entityId: string } }
) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { entityId } = params;

    // Fetch entity with org check
    const entity = await db.internalEntity.findUnique({
      where: { id: entityId },
    });

    if (!entity) {
      return NextResponse.json(
        { error: 'Entity not found' },
        { status: 404 }
      );
    }

    // Verify user has access to org
    const membership = await db.orgMembership.findUnique({
      where: {
        orgId_userId: {
          orgId: entity.orgId,
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json(
        { error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Fetch all memory facts
    const [drafts, verified, collisionAlerts, eventLogs] = await Promise.all([
      db.memoryDraft.findMany({
        where: { entityId },
        orderBy: { createdAt: 'desc' },
      }),
      db.memoryVerified.findMany({
        where: { entityId },
        orderBy: { createdAt: 'desc' },
      }),
      db.entityCollisionAlert.findMany({
        where: {
          OR: [
            { entityIdA: entityId },
            { entityIdB: entityId },
          ],
          status: 'pending',
        },
      }),
      db.memoryEventLog.findMany({
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
