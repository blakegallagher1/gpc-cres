import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { NotificationService } from "@/lib/services/notification.service";
import { isSchemaDriftError } from "@/lib/api/prismaSchemaFallback";

const service = new NotificationService();

// GET /api/notifications/unread-count — lightweight polling endpoint
export async function GET() {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await service.getUnreadCount(auth.userId);
    return NextResponse.json({ count });
  } catch (error) {
    console.error("Error fetching unread count:", error);
    if (isSchemaDriftError(error)) {
      return NextResponse.json({ count: 0 });
    }
    return NextResponse.json(
      { error: "Failed to fetch unread count" },
      { status: 500 }
    );
  }
}
