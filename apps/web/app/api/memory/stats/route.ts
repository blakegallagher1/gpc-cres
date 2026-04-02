import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@entitlement-os/db';
import { authorizeApiRoute } from '@/lib/auth/authorizeApiRoute';
import * as Sentry from "@sentry/nextjs";

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
    const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
    if (!authorization.ok) {
      return authorization.response;
    }
    const { orgId } = authorization.auth;

    // Fetch stats in parallel
    const [entitiesCount, verifiedCount, draftsCount, collisionsCount, innovationCount, recentEvents] = await Promise.all([
      prisma.internalEntity.count({ where: { orgId, type: 'property' } }),
      prisma.memoryVerified.count({ where: { orgId } }),
      prisma.memoryDraft.count({ where: { orgId } }),
      prisma.entityCollisionAlert.count({ where: { orgId, status: 'pending' } }),
      prisma.innovationQueue.count({ where: { orgId, status: 'pending' } }),
      prisma.memoryEventLog.count({
        where: {
          orgId,
          timestamp: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // last 7 days
          },
        },
      }),
    ]);

    // Fetch fact type breakdown
    const factTypeBreakdown = await prisma.memoryVerified.groupBy({
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
    Sentry.captureException(error, {
      tags: { route: "api.memory.stats", method: "GET" },
    });
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
