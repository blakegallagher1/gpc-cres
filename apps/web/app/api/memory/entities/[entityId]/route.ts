import { NextRequest, NextResponse } from 'next/server';
import { getMemoryEntityView } from '@gpc/server';
import { authorizeApiRoute } from '@/lib/auth/authorizeApiRoute';
import * as Sentry from "@sentry/nextjs";

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
    const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
    if (!authorization.ok || !authorization.auth) {
      return authorization.ok
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : authorization.response;
    }
    const { orgId } = authorization.auth;
    const { entityId } = await params;
    const detail = await getMemoryEntityView(orgId, entityId);

    if (detail.status === "not_found") {
      return NextResponse.json({ error: 'Entity not found' }, { status: 404 });
    }

    if (detail.status === "forbidden") {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({
      entity: detail.entity,
      drafts: detail.drafts,
      verified: detail.verified,
      collisionAlerts: detail.collisionAlerts,
      eventLogs: detail.eventLogs,
    });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.memory.entities", method: "GET" },
    });
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
