import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { NotificationService } from "@/lib/services/notification.service";
import * as Sentry from "@sentry/nextjs";

const service = new NotificationService();

// POST /api/notifications/mark-all-read
export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await service.markAllRead(auth.userId);
    return NextResponse.json({ success: true, markedRead: count });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.notifications.mark-all-read", method: "POST" },
    });
    console.error("Error marking all notifications read:", error);
    return NextResponse.json(
      { error: "Failed to mark all read" },
      { status: 500 }
    );
  }
}
