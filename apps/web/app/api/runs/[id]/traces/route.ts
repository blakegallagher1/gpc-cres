import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase";

// GET /api/runs/[id]/traces
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { data, error } = await supabaseAdmin
      .from("traces")
      .select("*")
      .eq("run_id", id)
      .order("started_at", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json({ traces: data ?? [] });
  } catch (error) {
    console.error("Error fetching run traces:", error);
    return NextResponse.json(
      { error: "Failed to fetch run traces" },
      { status: 500 }
    );
  }
}

// POST /api/runs/[id]/traces
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { data, error } = await supabaseAdmin
      .from("traces")
      .insert({
        ...body,
        run_id: id,
        started_at: body.started_at ?? new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ trace: data }, { status: 201 });
  } catch (error) {
    console.error("Error creating trace:", error);
    return NextResponse.json(
      { error: "Failed to create trace" },
      { status: 500 }
    );
  }
}
