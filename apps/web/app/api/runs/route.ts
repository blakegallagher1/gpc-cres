import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase";

// GET /api/runs - List all runs
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const agentId = searchParams.get("agentId");
    const status = searchParams.get("status");
    const limit = parseInt(searchParams.get("limit") || "50", 10);

    let query = supabaseAdmin
      .from("runs")
      .select("*, agent:agents(*)")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (agentId) {
      query = query.eq("agent_id", agentId);
    }
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error) {
      throw error;
    }

    return NextResponse.json({ runs: data ?? [] });
  } catch (error) {
    console.error("Error fetching runs:", error);
    return NextResponse.json(
      { error: "Failed to fetch runs" },
      { status: 500 }
    );
  }
}

// POST /api/runs - Create a new run
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const now = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("runs")
      .insert({
        ...body,
        status: body.status ?? "pending",
        tokens_used: body.tokens_used ?? 0,
        cost: body.cost ?? 0,
        started_at: body.started_at ?? now,
      })
      .select("*, agent:agents(*)")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ run: data }, { status: 201 });
  } catch (error) {
    console.error("Error creating run:", error);
    return NextResponse.json(
      { error: "Failed to create run" },
      { status: 500 }
    );
  }
}
