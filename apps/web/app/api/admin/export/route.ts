import { NextRequest, NextResponse } from "next/server";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import {
  fetchKnowledgeExportRows,
  fetchMemoryExportRows,
  formatKnowledgeCsvHeader,
  formatKnowledgeCsvRow,
  formatMemoryCsvHeader,
  formatMemoryCsvRow,
} from "@gpc/server/admin/export.service";

export async function POST(request: NextRequest) {
  const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    return authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
  }
  const { orgId } = authorization.auth;
  const body = await request.json();
  const type = body.type as string;

  const filename = `${type}_export_${new Date().toISOString().slice(0, 10)}.csv`;

  if (type === "knowledge") {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(formatKnowledgeCsvHeader());
          const rows = await fetchKnowledgeExportRows(orgId);
          for (const r of rows) {
            controller.enqueue(formatKnowledgeCsvRow(r));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } else if (type === "memory") {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(formatMemoryCsvHeader());
          const rows = await fetchMemoryExportRows(orgId);
          for (const r of rows) {
            controller.enqueue(formatMemoryCsvRow(r));
          }
          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
    return new NextResponse(stream, {
      headers: {
        "Content-Type": "text/csv",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } else {
    return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
  }
}
