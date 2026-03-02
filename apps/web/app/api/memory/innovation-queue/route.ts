import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@entitlement-os/db';
import { resolveAuth } from '@/lib/auth/resolveAuth';

/**
 * GET /api/memory/innovation-queue
 * 
 * Retrieve pending innovation queue items for review.
 * These are novel data points that significantly differ from existing knowledge.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await resolveAuth();
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, orgId } = authResult;

    // Fetch pending innovation queue items
    const items = await prisma.innovationQueue.findMany({
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
    const authResult = await resolveAuth();
    if (!authResult) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { userId, orgId } = authResult;

    const body = await request.json();
    const { itemId, decision } = body;

    if (!itemId || !decision || !['approved', 'rejected'].includes(decision)) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Update innovation queue item
    const updated = await prisma.innovationQueue.update({
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
