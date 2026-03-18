import { tool } from "@openai/agents";
import { z } from "zod";

import { buildMemoryToolHeaders } from "./memoryTools";

function resolveBaseUrl(): string {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL ?? process.env.VERCEL_URL ?? "http://localhost:3000";
  return baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`;
}

export const search_similar_episodes = tool({
  name: "search_similar_episodes",
  description:
    "Search prior completed agent runs for similar tasks, conclusions, and evidence-backed patterns.",
  parameters: z.object({
    query: z.string(),
    limit: z.number().optional().nullable(),
  }),
  execute: async (params, context) => {
    const qs = new URLSearchParams({
      view: "search",
      q: params.query,
      types: "episodic_summary",
    });
    if (params.limit) qs.set("limit", String(params.limit));

    const resp = await fetch(`${resolveBaseUrl()}/api/knowledge?${qs.toString()}`, {
      method: "GET",
      headers: buildMemoryToolHeaders(context),
    });

    if (!resp.ok) {
      return `Episode search failed: ${resp.status} ${await resp.text()}`;
    }

    const data = (await resp.json()) as { results?: unknown[] };
    return JSON.stringify(data.results ?? []);
  },
});

export const search_procedural_skills = tool({
  name: "search_procedural_skills",
  description:
    "Search reusable procedural playbooks derived from successful prior agent runs.",
  parameters: z.object({
    query: z.string(),
    limit: z.number().optional().nullable(),
  }),
  execute: async (params, context) => {
    const qs = new URLSearchParams({
      view: "search",
      q: params.query,
      types: "procedural_skill",
    });
    if (params.limit) qs.set("limit", String(params.limit));

    const resp = await fetch(`${resolveBaseUrl()}/api/knowledge?${qs.toString()}`, {
      method: "GET",
      headers: buildMemoryToolHeaders(context),
    });

    if (!resp.ok) {
      return `Procedure search failed: ${resp.status} ${await resp.text()}`;
    }

    const data = (await resp.json()) as { results?: unknown[] };
    return JSON.stringify(data.results ?? []);
  },
});
