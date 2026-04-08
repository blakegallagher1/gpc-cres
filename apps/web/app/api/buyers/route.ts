import { NextRequest, NextResponse } from "next/server";
import { BuyerValidationError, createBuyer, listBuyers } from "@gpc/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import * as Sentry from "@sentry/nextjs";

export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const buyers = await listBuyers(auth.orgId, {
      search: searchParams.get("search"),
      buyerType: searchParams.get("buyerType"),
      dealId: searchParams.get("dealId"),
      withDeals:
        searchParams.get("withDeals") === "1" ||
        searchParams.get("withDeals")?.toLowerCase() === "true",
    });

    return NextResponse.json({ buyers });
  } catch (error) {
    Sentry.captureException(error, {
      tags: { route: "api.buyers", method: "GET" },
    });
    console.error("Error fetching buyers:", error);
    return NextResponse.json(
      { error: "Failed to fetch buyers" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuth(request);
    if (!auth) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const buyer = await createBuyer(
      auth.orgId,
      (await request.json()) as Record<string, unknown>,
    );

    return NextResponse.json({ buyer }, { status: 201 });
  } catch (error) {
    if (error instanceof BuyerValidationError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    Sentry.captureException(error, {
      tags: { route: "api.buyers", method: "POST" },
    });
    console.error("Error creating buyer:", error);
    return NextResponse.json(
      { error: "Failed to create buyer" },
      { status: 500 },
    );
  }
}
