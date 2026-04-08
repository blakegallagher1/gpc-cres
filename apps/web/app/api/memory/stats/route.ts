import { NextRequest, NextResponse } from 'next/server';
import { authorizeApiRoute } from '@/lib/auth/authorizeApiRoute';
import { getMemoryStats } from "@gpc/server/services/memory-stats.service";
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
    if (!authorization.ok || !authorization.auth) {
      return authorization.ok
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : authorization.response;
    }
    const { orgId } = authorization.auth;

    return NextResponse.json(await getMemoryStats(orgId));
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
