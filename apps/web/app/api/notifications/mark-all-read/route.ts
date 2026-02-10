import { NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { NotificationService } from "@/lib/services/notification.service";

const service = new NotificationService();

// POST /api/notifications/mark-all-read
export async function POST() {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const count = await service.markAllRead(auth.userId);
    return NextResponse.json({ success: true, markedRead: count });
  } catch (error) {
    console.error("Error marking all notifications read:", error);
    return NextResponse.json(
      { error: "Failed to mark all read" },
      { status: 500 }
    );
  }
}
