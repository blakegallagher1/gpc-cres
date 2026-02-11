import { NextRequest, NextResponse } from "next/server";
import { resolveAuth } from "@/lib/auth/resolveAuth";
import {
  getParishSummary,
  getMarketTrends,
  getRecentDataPoints,
  addMarketDataPoint,
  type MarketDataType,
} from "@/lib/services/marketMonitor.service";

export async function GET(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const view = searchParams.get("view") ?? "recent";
  const parish = searchParams.get("parish") ?? undefined;
  const dataType = searchParams.get("dataType") as MarketDataType | undefined;

  try {
    switch (view) {
      case "summary": {
        if (!parish) {
          return NextResponse.json(
            { error: "parish is required for summary view" },
            { status: 400 }
          );
        }
        const summary = await getParishSummary(parish);
        return NextResponse.json(summary);
      }
      case "trends": {
        if (!parish) {
          return NextResponse.json(
            { error: "parish is required for trends view" },
            { status: 400 }
          );
        }
        const months = Number(searchParams.get("months") ?? 12);
        const trends = await getMarketTrends(parish, months);
        return NextResponse.json({ trends });
      }
      case "recent":
      default: {
        const limit = Number(searchParams.get("limit") ?? 50);
        const data = await getRecentDataPoints(parish, dataType, limit);
        return NextResponse.json({ data });
      }
    }
  } catch (error) {
    console.error("Market data error:", error);
    return NextResponse.json(
      { error: "Failed to fetch market data" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const auth = await resolveAuth();
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { parish, dataType, source, data, observedAt } = body;

    if (!parish || !dataType || !source) {
      return NextResponse.json(
        { error: "parish, dataType, and source are required" },
        { status: 400 }
      );
    }

    const id = await addMarketDataPoint(
      parish,
      dataType as MarketDataType,
      source,
      data ?? {},
      observedAt ? new Date(observedAt) : undefined
    );

    return NextResponse.json({ id });
  } catch (error) {
    console.error("Add market data error:", error);
    return NextResponse.json(
      { error: "Failed to add market data" },
      { status: 500 }
    );
  }
}
