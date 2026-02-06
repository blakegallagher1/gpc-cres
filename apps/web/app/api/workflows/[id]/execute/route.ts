import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/db/supabase";

// POST /api/workflows/[id]/execute - Execute workflow
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const { data: workflow, error: workflowError } = await supabaseAdmin
      .from("workflows")
      .select("*")
      .eq("id", id)
      .single();

    if (workflowError || !workflow) {
      return NextResponse.json({ error: "Workflow not found" }, { status: 404 });
    }

    const now = new Date().toISOString();
    const { data: run, error: runError } = await supabaseAdmin
      .from("runs")
      .insert({
        workflow_id: id,
        status: "running",
        input: body.input ?? null,
        started_at: now,
        tokens_used: 0,
        cost: 0,
      })
      .select()
      .single();

    if (runError) {
      throw runError;
    }

    await supabaseAdmin
      .from("workflows")
      .update({
        run_count: (workflow.run_count ?? 0) + 1,
        updated_at: now,
      })
      .eq("id", id);

    return NextResponse.json({ run });
  } catch (error) {
    console.error("Error executing workflow:", error);
    return NextResponse.json(
      { error: "Failed to execute workflow" },
      { status: 500 }
    );
  }
}
