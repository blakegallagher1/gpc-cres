import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import { NotificationService } from "@/lib/services/notification.service";
import type { NotificationFilters } from "@/lib/services/notification.service";

const service = new NotificationService();

// GET /api/notifications — paginated, filterable list
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth();
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const filters: NotificationFilters = {};

    const type = params.get("type");
    if (type) filters.type = type as NotificationFilters["type"];

    const priority = params.get("priority");
    if (priority) filters.priority = priority as NotificationFilters["priority"];

    if (params.get("unread") === "true") filters.unreadOnly = true;

    const dealId = params.get("dealId");
    if (dealId) filters.dealId = dealId;

    const limit = params.get("limit");
    if (limit) filters.limit = parseInt(limit, 10);

    const offset = params.get("offset");
    if (offset) filters.offset = parseInt(offset, 10);

    const result = await service.getAll(auth.userId, filters);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Error fetching notifications:", error);
    return NextResponse.json(
      { error: "Failed to fetch notifications" },
      { status: 500 }
    );
  }
}
