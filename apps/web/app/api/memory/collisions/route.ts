import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoute } from '@/lib/auth/authorizeApiRoute';
import {
  getPendingCollisions,
  resolveCollision,
} from "@gpc/server/services/entity-collision-detector.service";
import * as Sentry from "@sentry/nextjs";

/**
 * GET /api/memory/collisions
 * 
 * Retrieve pending collision alerts for an organization.
 * These represent conflicting data points that need resolution.
 */
export async function GET(request: NextRequest) {
  try {
    const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
    if (!authorization.ok || !authorization.auth) {
      return authorization.ok
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : authorization.response;
    }
    const { orgId } = authorization.auth;

    // Fetch collision alerts
    const alerts = await getPendingCollisions(orgId);

    return NextResponse.json({ alerts });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.memory.collisions", method: "GET" },
    });
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
    const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
    if (!authorization.ok || !authorization.auth) {
      return authorization.ok
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : authorization.response;
    }
    const { orgId, userId } = authorization.auth;

    const body = await request.json();
    const { alertId, resolution } = body;

    if (!alertId || !resolution) {
      return NextResponse.json(
        { error: 'Invalid request body' },
        { status: 400 }
      );
    }

    // Update collision alert
    const updated = await resolveCollision(orgId, alertId, userId, resolution);

    return NextResponse.json({ alert: updated });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.memory.collisions", method: "POST" },
    });
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
