import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@entitlement-os/db";
import { resolveAuth } from "@/lib/auth/resolveAuth";

export async function POST(request: NextRequest) {
  const auth = await resolveAuth(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const { orgId } = auth;
  const body = await request.json();
  const type = body.type as string;

  let csvRows: string[] = [];

  if (type === "knowledge") {
    const rows = await prisma.$queryRawUnsafe<Array<{
      id: string;
      content_type: string;
      source_id: string;
      content_text: string;
      created_at: Date;
    }>>(
      `SELECT id, content_type, source_id, content_text, created_at
       FROM knowledge_embeddings WHERE org_id = $1::uuid
       ORDER BY created_at DESC`,
      orgId
    );
    csvRows = [
      "id,content_type,source_id,content_text,created_at",
      ...rows.map((r) =>
        [r.id, r.content_type, r.source_id, `"${r.content_text.replace(/"/g, '""')}"`, r.created_at].join(",")
      ),
    ];
  } else if (type === "memory") {
    const rows = await prisma.memoryVerified.findMany({
      where: { orgId },
      orderBy: { createdAt: "desc" },
      include: { entity: { select: { canonicalAddress: true } } },
    });
    csvRows = [
      "id,entityId,address,factType,sourceType,economicWeight,payloadJson,createdAt",
      ...rows.map((r) =>
        [
          r.id,
          r.entityId,
          `"${(r.entity?.canonicalAddress ?? "").replace(/"/g, '""')}"`,
          r.factType,
          r.sourceType,
          r.economicWeight,
          `"${JSON.stringify(r.payloadJson).replace(/"/g, '""')}"`,
          r.createdAt.toISOString(),
        ].join(",")
      ),
    ];
  } else {
    return NextResponse.json({ error: "Invalid export type" }, { status: 400 });
  }

  return new NextResponse(csvRows.join("\n"), {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="${type}_export_${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
