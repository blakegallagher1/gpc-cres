import { NextRequest, NextResponse } from 'next/server';
import { db } from '@gpc/db';
import { auth } from '@clerk/nextjs/server';

/**
 * GET /api/memory/innovation-queue
 * 
 * Retrieve pending innovation queue items for review.
 * These are novel data points that significantly differ from existing knowledge.
 */
export async function GET(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get orgId from query params
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

    // Fetch pending innovation queue items
    const items = await db.innovationQueue.findMany({
      where: {
        orgId,
        status: 'pending',
      },
      include: {
        entity: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return NextResponse.json({ items });
  } catch (error) {
    console.error('[Innovation Queue API Error]', error);
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
 * POST /api/memory/innovation-queue/review
 * 
 * Review and approve/reject an innovation queue item.
 */
export async function POST(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { itemId, decision, orgId } = body;

    if (!itemId || !decision || !['approved', 'rejected'].includes(decision)) {
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
          userId,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Update innovation queue item
    const updated = await db.innovationQueue.update({
      where: { id: itemId },
      data: {
        status: decision,
        reviewedBy: userId,
        reviewedAt: new Date(),
        reviewDecision: decision,
      },
    });

    return NextResponse.json({ item: updated });
  } catch (error) {
    console.error('[Innovation Queue Review API Error]', error);
    return NextResponse.json(
      {
        error: 'Internal server error',
        message: error instanceof Error ? error.message : 'Unknown',
      },
      { status: 500 }
    );
  }
}
