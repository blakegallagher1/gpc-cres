import { supabase } from "@/lib/db/supabase";
import { Agent } from "@/types";

export async function fetchAgents() {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .order("name", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as Agent[];
}

export async function fetchAgentById(id: string) {
  const { data, error } = await supabase
    .from("agents")
    .select("*")
    .eq("id", id)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as Agent;
}
