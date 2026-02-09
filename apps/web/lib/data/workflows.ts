import { supabase } from "@/lib/db/supabase";
import { Workflow } from "@/types";

export async function fetchWorkflows() {
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Workflow[];
}

export async function fetchWorkflowById(id: string) {
  const { data, error } = await supabase
    .from("workflows")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Workflow;
}
