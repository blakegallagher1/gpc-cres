import { NextRequest, NextResponse } from "next/server";
import {
  MemoryIngestionAccessError,
  processMemoryIngestion,
} from "@gpc/server";
import { MemoryIngestionRequestSchema } from "@entitlement-os/shared";
import { authorizeApiRoute } from "@/lib/auth/authorizeApiRoute";
import * as Sentry from "@sentry/nextjs";

export async function POST(request: NextRequest) {
  try {
    const authorization = await authorizeApiRoute(request, request.nextUrl.pathname);
    if (!authorization.ok || !authorization.auth) {
      return authorization.ok
        ? NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        : authorization.response;
    }

    const auth = authorization.auth;
    const body = (await request.json()) as Record<string, unknown>;
    const enrichedBody = {
      ...body,
      userId: auth.userId,
      orgId: body.orgId || auth.orgId,
      requestId:
        typeof body.requestId === "string" && body.requestId.trim().length > 0
          ? body.requestId
          : crypto.randomUUID(),
    };

    const validationResult = MemoryIngestionRequestSchema.safeParse(enrichedBody);
    if (!validationResult.success) {
      return NextResponse.json(
        {
          error: "Invalid request",
          details: validationResult.error.issues,
        },
        { status: 400 },
      );
    }

    const result = await processMemoryIngestion({
      userId: auth.userId,
      orgId: auth.orgId,
      request: validationResult.data,
    });

    return NextResponse.json(result, { status: result.success ? 200 : 207 });
  } catch (error) {
    if (error instanceof MemoryIngestionAccessError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    Sentry.captureException(error, {
      tags: { route: "api.memory.ingest", method: "POST" },
    });
    console.error("[Memory Ingest API Error]", error);
    return NextResponse.json(
      {
        error: "Internal server error",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
