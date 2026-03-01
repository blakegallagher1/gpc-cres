import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@gpc/db';

/**
 * GET /api/memory/collisions
 * 
 * Retrieve pending collision alerts for an organization.
 * These represent conflicting data points that need resolution.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
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
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Fetch collision alerts
    const alerts = await db.entityCollisionAlert.findMany({
      where: {
        orgId,
        status: 'pending',
      },
      include: {
        entityA: true,
      },
      orderBy: {
        similarity: 'desc',
      },
    });

    return NextResponse.json({ alerts });
  } catch (error) {
    console.error('[Collisions API Error]', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/memory/collisions/resolve
 * 
 * Resolve a collision alert by choosing a resolution strategy.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { alertId, resolution, orgId } = body;

    if (!alertId || !resolution) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Verify membership
    const membership = await db.orgMembership.findUnique({
      where: {
        orgId_userId: {
          orgId,
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update collision alert
    const updated = await db.entityCollisionAlert.update({
      where: { id: alertId },
      data: {
        status: 'resolved',
        resolvedBy: session.user.id,
        resolvedAt: new Date(),
        resolution,
      },
    });

    return NextResponse.json({ alert: updated });
  } catch (error) {
    console.error('[Collision Resolution API Error]', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
