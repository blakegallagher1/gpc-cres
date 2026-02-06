import { supabase } from "@/lib/db/supabase";
import { Run, Trace } from "@/types";

export async function fetchRuns(params?: {
  agentId?: string;
  status?: string;
  limit?: number;
}) {
  let query = supabase.from("runs").select("*, agent:agents(*)");

  if (params?.agentId) {
    query = query.eq("agent_id", params.agentId);
  }
  if (params?.status) {
    query = query.eq("status", params.status);
  }
  if (params?.limit) {
    query = query.limit(params.limit);
  }

  const { data, error } = await query.order("started_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Run[];
}

export async function fetchRunById(id: string) {
  const { data, error } = await supabase
    .from("runs")
    .select("*, agent:agents(*)")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Run;
}

export async function fetchRunTraces(runId: string) {
  const { data, error } = await supabase
    .from("traces")
    .select("*")
    .eq("run_id", runId)
    .order("started_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Trace[];
}
