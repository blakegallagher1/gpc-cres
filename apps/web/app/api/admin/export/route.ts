import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";

export async function POST(request: NextRequest) {
  const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
  if (!authorization.ok || !authorization.auth) {
    return authorization.ok
      ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
      : authorization.response;
  }
  const auth = authorization.auth;
  const { orgId } = auth;
  const body = await request.json();
  const type = body.type as string;

  const LIMIT = 50000;
  const filename = `${type}_export_${new Date().toISOString().slice(0, 10)}.csv`;

  if (type === "knowledge") {
    const stream = new ReadableStream({
      async start(controller) {
        try {
          controller.enqueue(
            "id,content_type,source_id,content_text,created_at\n"
          );
          const rows = await prisma.$queryRawUnsafe<Array<{
            id: string;
            content_type: string;
            source_id: string;
            content_text: string;
            created_at: Date;
          }>>(
            `SELECT id, content_type, source_id, content_text, created_at
             FROM knowledge_embeddings WHERE org_id = $1::uuid
             ORDER BY created_at DESC LIMIT $2`,
            orgId,
            LIMIT
          );
          for (const r of rows) {
            const row =
              [
                r.id,
                r.content_type,
                r.source_id,
                `"${r.content_text.replace(/"/g, '""')}"`,
                r.created_at,
              ].join(",") + "\n";
            controller.enqueue(row);
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
          controller.enqueue(
            "id,entityId,address,factType,sourceType,economicWeight,payloadJson,createdAt\n"
          );
          const rows = await prisma.memoryVerified.findMany({
            where: { orgId },
            orderBy: { createdAt: "desc" },
            take: LIMIT,
            include: { entity: { select: { canonicalAddress: true } } },
          });
          for (const r of rows) {
            const row =
              [
                r.id,
                r.entityId,
                `"${(r.entity?.canonicalAddress ?? "").replace(/"/g, '""')}"`,
                r.factType,
                r.sourceType,
                r.economicWeight,
                `"${JSON.stringify(r.payloadJson).replace(/"/g, '""')}"`,
                r.createdAt.toISOString(),
              ].join(",") + "\n";
            controller.enqueue(row);
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
