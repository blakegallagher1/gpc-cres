import { NextRequest, NextResponse } from 'next/server';
import { db } from '@gpc/db';
import { auth } from '@clerk/nextjs/server';

/**
 * GET /api/memory/stats
 * 
 * Get memory system statistics for an organization:
 * - Total entities
 * - Total verified facts
 * - Total draft facts
 * - Pending collisions
 * - Innovation queue size
 * - Event log growth
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get('orgId');

    if (!orgId) {
      return NextResponse.json(
        { error: 'Missing orgId parameter' },
        { status: 400 }
      );
    }

    // Verify membership
    const membership = await db.orgMembership.findUnique({
      where: {
        orgId_userId: {
          orgId,
          userId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch stats in parallel
    const [entitiesCount, verifiedCount, draftsCount, collisionsCount, innovationCount, recentEvents] = await Promise.all([
      db.internalEntity.count({ where: { orgId, type: 'property' } }),
      db.memoryVerified.count({ where: { orgId } }),
      db.memoryDraft.count({ where: { orgId } }),
      db.entityCollisionAlert.count({ where: { orgId, status: 'pending' } }),
      db.innovationQueue.count({ where: { orgId, status: 'pending' } }),
      db.memoryEventLog.count({
        where: {
          orgId,
          timestamp: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // last 7 days
          },
        },
      }),
    ]);

    // Fetch fact type breakdown
    const factTypeBreakdown = await db.memoryVerified.groupBy({
      by: ['factType'],
      where: { orgId },
      _count: true,
    });

    return NextResponse.json({
      totalEntities: entitiesCount,
      totalVerifiedFacts: verifiedCount,
      totalDraftFacts: draftsCount,
      pendingCollisions: collisionsCount,
      pendingInnovations: innovationCount,
      eventsLast7Days: recentEvents,
      factTypeBreakdown: factTypeBreakdown.map((item) => ({
        factType: item.factType,
        count: item._count,
      })),
    });
  } catch (error) {
    console.error('[Memory Stats API Error]', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
