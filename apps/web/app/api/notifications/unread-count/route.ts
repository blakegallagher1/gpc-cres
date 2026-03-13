import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { NotificationService } from "@/lib/services/notification.service";
import { isSchemaDriftError } from "@/lib/api/prismaSchemaFallback";
import { shouldUseAppDatabaseDevFallback } from "@/lib/server/appDbEnv";
import { isPrismaConnectivityError } from "@/lib/server/devParcelFallback";
import * as Sentry from "@sentry/nextjs";

const service = new NotificationService();

// GET /api/notifications/unread-count — lightweight polling endpoint
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (shouldUseAppDatabaseDevFallback()) {
      return NextResponse.json({ count: 0, degraded: true });
    }

    const count = await service.getUnreadCount(auth.userId);
    return NextResponse.json({ count });
  } catch (error) {
    if (isSchemaDriftError(error) || isPrismaConnectivityError(error)) {
      return NextResponse.json({ count: 0, degraded: true });
    }
    console.error("Error fetching unread count:", error);
    Sentry.captureException(error, {
      tags: { route: "api.notifications.unread-count", method: "GET" },
    });
    return NextResponse.json(
      { error: "Failed to fetch unread count" },
      { status: 500 }
    );
  }
}
