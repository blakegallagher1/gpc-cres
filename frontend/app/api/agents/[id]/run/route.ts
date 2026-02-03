import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase";

// POST /api/agents/[id]/run - Run an agent
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { data: agent, error: agentError } = await supabaseAdmin
      .from("agents")
      .select("*")
      .eq("id", id)
      .single();

    if (agentError || !agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    const now = new Date().toISOString();

    const { data: run, error: runError } = await supabaseAdmin
      .from("runs")
      .insert({
        agent_id: id,
        status: "running",
        input: body.input ?? null,
        started_at: now,
        tokens_used: 0,
        cost: 0,
      })
      .select("*, agent:agents(*)")
      .single();

    if (runError) {
      throw runError;
    }

    await supabaseAdmin
      .from("agents")
      .update({
        run_count: (agent.run_count ?? 0) + 1,
        updated_at: now,
      })
      .eq("id", id);

    return NextResponse.json({ run });
  } catch (error) {
    console.error("Error running agent:", error);
    return NextResponse.json(
      { error: "Failed to run agent" },
      { status: 500 }
    );
  }
}
