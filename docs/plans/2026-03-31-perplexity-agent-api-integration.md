# Perplexity Agent API Integration for Entitlement OS

**Date:** 2026-03-31
**Status:** Planned
**Author:** Claude Code + Blake Gallagher

---

## Table of Contents

1. [Perplexity Agent API — Complete Reference](#part-1-perplexity-agent-api--complete-reference)
2. [Implementation Plan — Entitlement OS Integration](#part-2-implementation-plan--entitlement-os-integration)

---

# Part 1: Perplexity Agent API — Complete Reference

> Everything an agent needs to know to use the Perplexity Agent API as of 2026-03-31.

## 1.1 Overview

The Perplexity Agent API is a **multi-provider, interoperable API** for building LLM applications. It provides:

- **Single endpoint** to access models from OpenAI, Anthropic, Google, xAI, NVIDIA, and Perplexity
- **Built-in web search** (`web_search`) and **URL fetching** (`fetch_url`) as first-class tools
- **Presets** — opinionated configs for common research patterns (fast-search, pro-search, deep-research)
- **Structured outputs** via JSON Schema
- **Model fallback chains** for provider resilience
- **Transparent cost reporting** — every response includes exact USD cost breakdown
- **OpenAI SDK compatibility** — swap `base_url` and it works

## 1.2 Endpoint & Authentication

```
POST https://api.perplexity.ai/v1/agent
Alias: POST /v1/responses  (OpenAI Responses API compatible)
```

**Auth:** Bearer token via HTTP header.

```bash
export PERPLEXITY_API_KEY="pplx-..."
```

```
Authorization: Bearer $PERPLEXITY_API_KEY
```

**Console & API Keys:** https://console.perplexity.ai

## 1.3 SDKs

### Python
```bash
pip install perplexityai
```
```python
from perplexity import Perplexity

client = Perplexity()  # reads PERPLEXITY_API_KEY from env
```

### TypeScript
```bash
npm install @perplexity-ai/perplexity_ai
```
```typescript
import Perplexity from '@perplexity-ai/perplexity_ai';

const client = new Perplexity();  // reads PERPLEXITY_API_KEY from env
```

### OpenAI SDK (Drop-in Replacement)
```python
from openai import OpenAI

client = OpenAI(
    api_key=os.environ["PERPLEXITY_API_KEY"],
    base_url="https://api.perplexity.ai/v1"
)
# client.responses.create() routes to /v1/responses → aliased to /v1/agent
```

```typescript
import OpenAI from 'openai';

const client = new OpenAI({
    apiKey: process.env.PERPLEXITY_API_KEY,
    baseURL: "https://api.perplexity.ai/v1"
});
```

For Perplexity-specific features (presets, tool filters), pass via `extra_body`:
```python
response = client.responses.create(
    input="query",
    extra_body={"preset": "pro-search"}
)
```

## 1.4 Request Parameters — Complete Reference

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `input` | `string \| InputItem[]` | **Yes** | — | Query text or structured message array (supports multi-turn, images) |
| `model` | `string` | One of model/models/preset | — | Model ID, e.g. `"openai/gpt-5.4"` |
| `models` | `string[]` | Alt to model | — | Fallback chain, max 5. Tried in order until one succeeds. |
| `preset` | `string` | Alt to model | — | `"fast-search"`, `"pro-search"`, `"deep-research"`, `"advanced-deep-research"` |
| `instructions` | `string` | No | — | System prompt. **Only affects generation, NOT search queries.** |
| `tools` | `ToolDef[]` | No | — | Array of tool definitions: `web_search`, `fetch_url`, or `function` |
| `max_output_tokens` | `integer` | No | model default | Minimum: 1 |
| `max_steps` | `integer` | No | preset default | Research loop iterations. Range: 1–10. |
| `reasoning` | `object` | No | — | `{ effort: "low" \| "medium" \| "high" }` |
| `response_format` | `object` | No | — | JSON schema structured output (see 1.8) |
| `stream` | `boolean` | No | `false` | Enable SSE streaming |
| `temperature` | `float` | No | 1 | Sampling temperature |
| `top_p` | `float` | No | 1 | Nucleus sampling |
| `frequency_penalty` | `float` | No | 0 | Frequency penalty |
| `presence_penalty` | `float` | No | 0 | Presence penalty |
| `language_preference` | `string` | No | — | ISO 639-1 language code for response language |

### Minimal Request
```json
{
  "model": "openai/gpt-5.4",
  "input": "What is the zoning for 1234 Main St, Baton Rouge, LA?"
}
```

### Full-Featured Request
```json
{
  "model": "openai/gpt-5.1",
  "input": "Recent industrial land sales in East Baton Rouge Parish",
  "instructions": "Return data in a structured table format. Be precise about acreage and price.",
  "tools": [
    {
      "type": "web_search",
      "filters": {
        "search_domain_filter": ["loopnet.com", "costar.com", "theadvocate.com"],
        "search_recency_filter": "month",
        "search_after_date": "1/1/2025"
      }
    },
    { "type": "fetch_url" }
  ],
  "max_output_tokens": 4096,
  "max_steps": 5,
  "response_format": {
    "type": "json_schema",
    "json_schema": {
      "name": "land_sales",
      "schema": {
        "type": "object",
        "properties": {
          "sales": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "address": { "type": "string" },
                "acres": { "type": "number" },
                "price": { "type": "number" },
                "date": { "type": "string" }
              }
            }
          }
        }
      }
    }
  }
}
```

## 1.5 Available Models & Pricing

All pricing is per 1M tokens unless noted.

| Provider | Model ID | Input | Output | Notes |
|----------|----------|-------|--------|-------|
| Perplexity | `perplexity/sonar` | $0.25 | $2.50 | Perplexity's own model |
| OpenAI | `openai/gpt-5.4` | $2.50 | $15.00 | Frontier |
| OpenAI | `openai/gpt-5.2` | $1.75 | $14.00 | Strong reasoning |
| OpenAI | `openai/gpt-5.1` | $1.25 | $10.00 | Good balance |
| OpenAI | `openai/gpt-5-mini` | $0.25 | $2.00 | Budget |
| Anthropic | `anthropic/claude-opus-4-6` | $5.00 | $25.00 | Most capable |
| Anthropic | `anthropic/claude-sonnet-4-6` | $3.00 | $15.00 | Fast + capable |
| Anthropic | `anthropic/claude-haiku-4-5` | $1.00 | $5.00 | Budget |
| Google | `google/gemini-3.1-pro-preview` | $2.00 | $12.00 | <=200k ctx; $4/$18 >200k |
| Google | `google/gemini-3-flash-preview` | $0.50 | $3.00 | Fast |
| Google | `google/gemini-2.5-pro` | $1.25 | $10.00 | <=200k ctx; $2.50/$15 >200k |
| xAI | `xai/grok-4-1-fast-non-reasoning` | $0.20 | $0.50 | Cheapest, no reasoning |
| NVIDIA | `nvidia/nemotron-3-super-120b-a12b` | $0.25 | $2.50 | Open-source class |

**Tool costs (on top of token costs):**
- `web_search`: **$0.005 per call**
- `fetch_url`: **$0.0005 per call**
- Function calling: **no additional cost**

## 1.6 Tools

### 1.6.1 Web Search

Real-time web search. The model autonomously decides when to search based on the query and instructions.

```json
{
  "type": "web_search",
  "filters": {
    "search_domain_filter": ["nasa.gov", "wikipedia.org", "-reddit.com"],
    "search_recency_filter": "week",
    "search_after_date": "3/1/2025",
    "search_before_date": "3/31/2025",
    "max_tokens_per_page": 2000,
    "country": "US",
    "city": "Baton Rouge",
    "region": "Louisiana"
  }
}
```

**Filter details:**

| Filter | Type | Description |
|--------|------|-------------|
| `search_domain_filter` | `string[]` | Max 20. No prefix = allowlist. `-` prefix = denylist. Works at domain or URL level. |
| `search_recency_filter` | `string` | `"day"`, `"week"`, `"month"`, `"year"` |
| `search_after_date` | `string` | `"M/D/YYYY"` format. Results published after this date. |
| `search_before_date` | `string` | `"M/D/YYYY"` format. Results published before this date. |
| `last_updated_after_filter` | `string` | `"M/D/YYYY"` — filter by last-updated date |
| `last_updated_before_filter` | `string` | `"M/D/YYYY"` — filter by last-updated date |
| `max_tokens_per_page` | `integer` | Control content retrieved per result (manages token cost) |
| `country` | `string` | ISO 3166-1 country code |
| `city` | `string` | City name (improves location accuracy) |
| `region` | `string` | Region/state name |

**Important:** Use API filter parameters instead of prompt instructions for search control. Filters are guaranteed to execute; prompt instructions are not.

### 1.6.2 Fetch URL

Extract full content from a specific URL. Use when you already have the URL.

```json
{ "type": "fetch_url" }
```

No additional configuration. The model calls it when it has a URL to analyze.

### 1.6.3 Function Calling

Define custom functions for the model to call. No extra cost beyond tokens.

```json
{
  "type": "function",
  "name": "get_parcel_details",
  "description": "Look up details for a Louisiana parcel by ID",
  "parameters": {
    "type": "object",
    "properties": {
      "parcel_id": { "type": "string", "description": "The parcel ID to look up" }
    },
    "required": ["parcel_id"]
  },
  "strict": true
}
```

**Function calling lifecycle:**

1. Define functions in `tools` array
2. Send request with `input` + function definitions
3. Model returns `function_call` output items when it wants to call a function:
   ```json
   {
     "type": "function_call",
     "call_id": "call_abc123",
     "name": "get_parcel_details",
     "arguments": "{\"parcel_id\": \"EBR-12345\"}"
   }
   ```
   **`arguments` is a JSON STRING — must parse with `JSON.parse()` or `json.loads()`**
4. Execute the function in your code
5. Return result as `function_call_output` in the next request's `input`:
   ```json
   {
     "type": "function_call_output",
     "call_id": "call_abc123",
     "output": "{\"owner\": \"Smith LLC\", \"acres\": 12.5, \"zoning\": \"M-1\"}"
   }
   ```
6. Model generates final response incorporating function results

## 1.7 Presets

Pre-configured setups optimized for specific research patterns. Include a model, token limits, reasoning steps, tools, and system prompts.

| Preset | Model | Max Steps | Tools | Best For |
|--------|-------|-----------|-------|----------|
| `fast-search` | `xai/grok-4-1-fast-non-reasoning` | 1 | `web_search` | Quick factual lookups. Cheapest option. |
| `pro-search` | `openai/gpt-5.1` | 3 | `web_search`, `fetch_url` | Balanced, researched answers for most queries. |
| `deep-research` | `openai/gpt-5.2` | 10 | `web_search`, `fetch_url` | Complex multi-step analysis. |
| `advanced-deep-research` | `anthropic/claude-opus-4-6` | 10 | `web_search`, `fetch_url` | Institutional-grade, maximum depth. Most expensive. |

**Usage:**
```python
response = client.responses.create(
    preset="pro-search",
    input="Your question"
)
print(f"Model used: {response.model}")
```

**Override preset defaults** while keeping others:
```python
response = client.responses.create(
    preset="pro-search",
    model="anthropic/claude-sonnet-4-6",  # override model
    max_steps=5                           # override steps
)
```

## 1.8 Structured Outputs (JSON Schema)

Force the response into a specific JSON structure.

```python
response = client.responses.create(
    model="openai/gpt-5.1",
    input="Find recent truck parking sales in Louisiana",
    tools=[{"type": "web_search"}],
    response_format={
        "type": "json_schema",
        "json_schema": {
            "name": "truck_parking_comps",   # 1-64 alphanumeric chars
            "schema": {
                "type": "object",
                "properties": {
                    "comps": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "address": {"type": "string"},
                                "parish": {"type": "string"},
                                "sale_price": {"type": "number"},
                                "acres": {"type": "number"},
                                "spaces": {"type": "integer"},
                                "cap_rate": {"type": "number"},
                                "sale_date": {"type": "string"},
                                "source_url": {"type": "string"}
                            }
                        }
                    }
                }
            }
        }
    }
)
```

**Caveats:**
- First request with a new schema has extra first-token latency (schema compilation)
- **Never ask for URLs/links in JSON schema** — they hallucinate. Use the `search_results` output item instead for source URLs.
- Include format hints in prompts to improve schema adherence

## 1.9 Model Fallback

Specify up to 5 models. API tries each in order until one succeeds.

```python
response = client.responses.create(
    models=[
        "openai/gpt-5.4",
        "anthropic/claude-sonnet-4-6",
        "google/gemini-2.5-pro"
    ],
    input="Your query",
    tools=[{"type": "web_search"}]
)
# response.model tells you which one served the request
# response.usage.cost reflects only the model that ran
```

- `models` takes precedence over `model` if both provided
- Billing is based on the model that serves the request, not all models in the chain
- Order by preference (most preferred first)

## 1.10 Streaming

Set `stream=True` for Server-Sent Events (SSE).

```python
response = client.responses.create(
    model="openai/gpt-5.4",
    input="Analyze this market",
    stream=True
)

for event in response:
    if event.type == "response.output_text.delta":
        print(event.delta, end="", flush=True)
    elif event.type == "response.completed":
        print(f"\nCost: ${event.response.usage.cost.total_cost}")
```

**SSE Event Types:**

| Event | Description |
|-------|-------------|
| `response.created` | Response object created |
| `response.in_progress` | Processing started |
| `response.completed` | Done — includes full `usage` block |
| `response.failed` | Error occurred |
| `response.output_item.added` | New output item (message, search_results, etc.) |
| `response.output_item.done` | Output item complete |
| `response.output_text.delta` | Text chunk — the main content stream |
| `response.output_text.done` | Text output complete |
| `response.reasoning.started` | Reasoning phase began |
| `response.reasoning.stopped` | Reasoning phase ended |
| `response.reasoning.search_queries` | Search queries being executed |
| `response.reasoning.search_results` | Search results returned |
| `response.reasoning.fetch_url_queries` | URLs being fetched |
| `response.reasoning.fetch_url_results` | URL content returned |

All events include `sequence_number` for ordering.

## 1.11 Image Attachments

Pass images via `input` array using `input_image` content type.

```python
import base64

def encode_image(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode("utf-8")

response = client.responses.create(
    model="openai/gpt-5.4",
    input=[{
        "role": "user",
        "content": [
            {"type": "input_text", "text": "What's in this image?"},
            {"type": "input_image", "image_url": f"data:image/png;base64,{encode_image('photo.png')}"}
        ]
    }]
)
```

- **Formats:** PNG, JPEG, WEBP, GIF
- **Max size:** 50 MB per image
- **Token cost:** `(width x height) / 750` tokens at input rate
- Also supports HTTPS URLs: `{"type": "input_image", "image_url": "https://example.com/photo.jpg"}`

## 1.12 Response Structure

### Non-Streaming Response
```json
{
  "id": "resp_f854ed0a-...",
  "object": "response",
  "created_at": 1771891464,
  "completed_at": 1771891466,
  "status": "completed",
  "model": "openai/gpt-5.4",
  "background": false,
  "output": [
    {
      "type": "message",
      "role": "assistant",
      "status": "completed",
      "content": [
        {
          "type": "output_text",
          "text": "Based on my research, here are the recent industrial land sales..."
        }
      ]
    },
    {
      "type": "search_results",
      "queries": ["industrial land sales East Baton Rouge 2025"],
      "results": [
        {
          "title": "Industrial Land Sale - LoopNet",
          "url": "https://loopnet.com/...",
          "date": "2025-11-15"
        }
      ]
    }
  ],
  "usage": {
    "input_tokens": 145,
    "output_tokens": 892,
    "total_tokens": 1037,
    "input_tokens_details": {
      "cache_creation": 0,
      "cache_read": 45
    },
    "tool_calls_details": {
      "web_search": 2,
      "fetch_url": 1
    },
    "cost": {
      "currency": "USD",
      "input_cost": 0.00018,
      "output_cost": 0.01338,
      "total_cost": 0.01356
    }
  }
}
```

**Response status values:** `completed`, `failed`, `in_progress`, `requires_action`

**Output item types:**

| Type | Description |
|------|-------------|
| `message` | Assistant text response. Has `content` array of `output_text` parts. |
| `search_results` | Web search results with `queries` and `results` (title, url, date). **This is where source URLs come from.** |
| `fetch_url_results` | Fetched URL content. Has `contents` array of `UrlContent`. |
| `function_call` | Function call request. Has `call_id`, `name`, `arguments` (JSON string). |

**Convenience property:** Both SDKs expose `response.output_text` which aggregates all text from all message output items.

## 1.13 Prompting Best Practices

1. **Be specific** — 2-3 extra words of context dramatically improve results
2. **No few-shot examples** — examples confuse the search component (it searches for your example text)
3. **Use expert terminology** — search-friendly language, not casual phrasing
4. **Never ask for URLs in prompts** — URLs come via `search_results` output, not generated text
5. **`instructions` only affects generation** — the search component does NOT attend to system prompts
6. **Use API filters, not prompt instructions** — `search_domain_filter`, `search_recency_filter` etc. are guaranteed to execute
7. **Instruct "say I don't know"** — explicitly tell the model to acknowledge when information isn't available (reduces hallucination)
8. **Don't query paywalled content** — LinkedIn, paywalled news, private documents are inaccessible

## 1.14 Error Handling

SDK error types:
- `APIConnectionError` — network failure
- `RateLimitError` — rate limit exceeded
- `APIStatusError` / `APIError` — API-level errors

```python
from perplexity import Perplexity, APIConnectionError, RateLimitError, APIStatusError

client = Perplexity()
try:
    response = client.responses.create(...)
except APIConnectionError:
    # retry with backoff
except RateLimitError:
    # wait and retry
except APIStatusError as e:
    print(f"API error {e.status_code}: {e.message}")
```

## 1.15 Key Documentation URLs

| Resource | URL |
|----------|-----|
| Full docs index | https://docs.perplexity.ai/llms.txt |
| API Console / Keys | https://console.perplexity.ai |
| Agent API Reference | https://docs.perplexity.ai/api-reference/agent-post |
| Community | https://community.perplexity.ai |
| OpenAPI spec | https://docs.perplexity.ai/openapi.json |
| MCP Server integration | https://docs.perplexity.ai/docs/getting-started/integrations/mcp-server |
| LangChain integration | https://docs.perplexity.ai/docs/getting-started/integrations/langchain |

---

# Part 2: Implementation Plan — Entitlement OS Integration

## 2.0 Architecture Overview

New Perplexity tools slot into the existing tool system alongside the 115+ tools in `entitlementOsTools`. The unified EntitlementOS agent decides when to use Perplexity (web research) vs. local property DB (authoritative parcel data) vs. CUA browser automation (interactive sites requiring login).

```
packages/openai/src/tools/
  ├── perplexityTools.ts          ← NEW: Perplexity client + tool definitions
  ├── browserTools.ts             ← EXISTING: CUA (kept for login-required sites)
  ├── hostedTools.ts              ← EXISTING: OpenAI web_search_preview
  ├── index.ts                    ← MODIFIED: import + wire perplexity tools
  └── ...

packages/openai/package.json      ← MODIFIED: add perplexityai SDK dependency

apps/web/.env.local               ← MODIFIED: add PERPLEXITY_API_KEY
.env.example                      ← MODIFIED: add PERPLEXITY_API_KEY placeholder
```

### Dependency Addition

```bash
cd packages/openai
npm install perplexityai    # or: add to package.json manually
```

### Environment Variable

Add to `.env.example`, `apps/web/.env.local`, and Vercel environment:
```
PERPLEXITY_API_KEY=pplx-...
```

---

## 2.1 Implementation: Replace CUA for Web Research

### Problem
`browser_task` in `packages/openai/src/tools/browserTools.ts` uses GPT-5.4 `computer_call` via a Playwright+Chromium Docker container. It's:
- **Slow:** 30-120 seconds per task (screenshot loop + polling)
- **Expensive:** GPT-5.4 vision tokens for every screenshot
- **Brittle:** Depends on Windows Docker Desktop uptime, Cloudflare tunnel, Playwright container
- **Overkill:** Most web research doesn't need interactive browser navigation

### Solution
New `perplexity_web_research` tool handles 60-70% of what `browser_task` does today. `browser_task` stays for sites requiring login, interactive forms, or JavaScript-heavy SPAs.

### Files to Create/Modify

**CREATE** `packages/openai/src/tools/perplexityTools.ts`:

```typescript
import { tool } from "@openai/agents";
import { z } from "zod";
import Perplexity from "@perplexity-ai/perplexity_ai";

// Lazy singleton — initialized on first call
let _client: InstanceType<typeof Perplexity> | null = null;
function getClient(): InstanceType<typeof Perplexity> {
  if (!_client) {
    const apiKey = process.env.PERPLEXITY_API_KEY?.trim();
    if (!apiKey) throw new Error("PERPLEXITY_API_KEY not configured");
    _client = new Perplexity({ apiKey });
  }
  return _client;
}

/**
 * General-purpose web research via Perplexity Agent API.
 * Replaces browser_task for non-interactive web lookups.
 */
export const perplexity_web_research = tool({
  name: "perplexity_web_research",
  description:
    "Search the live web for current information using Perplexity AI. " +
    "Use this for market research, news, regulatory updates, comp data, " +
    "planning commission minutes, zoning changes, and any public web content. " +
    "PREFER this over browser_task unless the site requires login or interactive navigation. " +
    "Returns structured text with source citations.",
  parameters: z.object({
    query: z.string().describe(
      "The research question. Be specific — include location, date range, property type. " +
      "Example: 'Recent industrial land sales in East Baton Rouge Parish 2025-2026, price per acre'"
    ),
    preset: z.enum(["fast-search", "pro-search", "deep-research"]).nullable()
      .describe(
        "Research depth. fast-search = quick factual lookup (1 step). " +
        "pro-search = balanced research (3 steps). " +
        "deep-research = multi-step complex analysis (10 steps). " +
        "null = defaults to pro-search."
      ),
    domain_filter: z.array(z.string()).nullable()
      .describe(
        "Limit search to specific domains (max 20). " +
        "Prefix with '-' to exclude. Example: ['loopnet.com', '-reddit.com']. " +
        "null = search all domains."
      ),
    recency: z.enum(["day", "week", "month", "year"]).nullable()
      .describe("Filter results by recency. null = no recency filter."),
  }),
  execute: async ({ query, preset, domain_filter, recency }) => {
    const client = getClient();
    const selectedPreset = preset ?? "pro-search";

    const tools: Array<Record<string, unknown>> = [];
    const filters: Record<string, unknown> = {};

    if (domain_filter?.length) {
      filters.search_domain_filter = domain_filter;
    }
    if (recency) {
      filters.search_recency_filter = recency;
    }

    const webSearchTool: Record<string, unknown> = { type: "web_search" };
    if (Object.keys(filters).length > 0) {
      webSearchTool.filters = filters;
    }
    tools.push(webSearchTool);

    if (selectedPreset !== "fast-search") {
      tools.push({ type: "fetch_url" });
    }

    try {
      const response = await client.responses.create({
        preset: selectedPreset,
        input: query,
        tools,
      });

      // Extract source URLs from search_results output items
      const sources: Array<{ title: string; url: string; date?: string }> = [];
      for (const item of response.output ?? []) {
        if ((item as any).type === "search_results") {
          for (const result of (item as any).results ?? []) {
            sources.push({
              title: result.title,
              url: result.url,
              date: result.date,
            });
          }
        }
      }

      return {
        success: true,
        text: response.output_text,
        sources,
        model: response.model,
        cost: response.usage?.cost,
        usage: {
          input_tokens: response.usage?.input_tokens,
          output_tokens: response.usage?.output_tokens,
        },
        _hint:
          "Research complete. If this data should be persisted, " +
          "use store_knowledge_entry or store_property_finding.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `Perplexity web research failed: ${message}`,
        query,
        preset: selectedPreset,
      };
    }
  },
});

/**
 * Structured data extraction from web via Perplexity.
 * Returns JSON matching a predefined schema for direct DB ingestion.
 */
export const perplexity_structured_extract = tool({
  name: "perplexity_structured_extract",
  description:
    "Extract structured data from the web using Perplexity AI with JSON schema output. " +
    "Use this when you need machine-readable data: comparable sales, market metrics, " +
    "permit lists, facility inventories. Returns validated JSON matching the requested schema. " +
    "PREFER this over browser_task for data extraction from public websites.",
  parameters: z.object({
    query: z.string().describe(
      "What data to find. Be specific about geography, time range, and data fields needed."
    ),
    schema_type: z.enum([
      "comparable_sales",
      "market_metrics",
      "permit_data",
      "facility_inventory",
      "regulatory_filings",
      "custom",
    ]).describe("Predefined schema type, or 'custom' to provide your own."),
    custom_schema: z.string().nullable()
      .describe(
        "JSON string of a custom JSON Schema. Required when schema_type is 'custom'. " +
        "Must be a valid JSON Schema object with 'type', 'properties', etc."
      ),
    domain_filter: z.array(z.string()).nullable()
      .describe("Limit search to specific domains (max 20). null = all."),
    recency: z.enum(["day", "week", "month", "year"]).nullable()
      .describe("Filter results by recency. null = no filter."),
  }),
  execute: async ({ query, schema_type, custom_schema, domain_filter, recency }) => {
    const client = getClient();

    // Predefined schemas for common CRE data types
    const SCHEMAS: Record<string, { name: string; schema: Record<string, unknown> }> = {
      comparable_sales: {
        name: "comparable_sales",
        schema: {
          type: "object",
          properties: {
            comps: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  address: { type: "string" },
                  city: { type: "string" },
                  parish_or_county: { type: "string" },
                  state: { type: "string" },
                  property_type: { type: "string" },
                  sale_price: { type: "number" },
                  price_per_acre: { type: "number" },
                  price_per_sf: { type: "number" },
                  acres: { type: "number" },
                  building_sf: { type: "integer" },
                  cap_rate: { type: "number" },
                  sale_date: { type: "string" },
                  buyer: { type: "string" },
                  seller: { type: "string" },
                  source: { type: "string" },
                },
              },
            },
          },
        },
      },
      market_metrics: {
        name: "market_metrics",
        schema: {
          type: "object",
          properties: {
            metrics: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  metric_name: { type: "string" },
                  value: { type: "number" },
                  unit: { type: "string" },
                  geography: { type: "string" },
                  property_type: { type: "string" },
                  period: { type: "string" },
                  source: { type: "string" },
                },
              },
            },
          },
        },
      },
      permit_data: {
        name: "permit_data",
        schema: {
          type: "object",
          properties: {
            permits: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  permit_number: { type: "string" },
                  type: { type: "string" },
                  description: { type: "string" },
                  address: { type: "string" },
                  applicant: { type: "string" },
                  status: { type: "string" },
                  date_filed: { type: "string" },
                  date_issued: { type: "string" },
                  estimated_cost: { type: "number" },
                  source: { type: "string" },
                },
              },
            },
          },
        },
      },
      facility_inventory: {
        name: "facility_inventory",
        schema: {
          type: "object",
          properties: {
            facilities: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  address: { type: "string" },
                  type: { type: "string" },
                  total_sf: { type: "integer" },
                  acres: { type: "number" },
                  spaces_or_units: { type: "integer" },
                  occupancy_pct: { type: "number" },
                  asking_rate: { type: "number" },
                  owner: { type: "string" },
                  source: { type: "string" },
                },
              },
            },
          },
        },
      },
      regulatory_filings: {
        name: "regulatory_filings",
        schema: {
          type: "object",
          properties: {
            filings: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  filing_type: { type: "string" },
                  agency: { type: "string" },
                  description: { type: "string" },
                  entity: { type: "string" },
                  location: { type: "string" },
                  date: { type: "string" },
                  status: { type: "string" },
                  case_number: { type: "string" },
                  source: { type: "string" },
                },
              },
            },
          },
        },
      },
    };

    let jsonSchema: { name: string; schema: Record<string, unknown> };
    if (schema_type === "custom") {
      if (!custom_schema) {
        return { success: false, error: "custom_schema required when schema_type is 'custom'" };
      }
      try {
        jsonSchema = { name: "custom_extract", schema: JSON.parse(custom_schema) };
      } catch {
        return { success: false, error: "Invalid JSON in custom_schema" };
      }
    } else {
      jsonSchema = SCHEMAS[schema_type];
    }

    const tools: Array<Record<string, unknown>> = [];
    const filters: Record<string, unknown> = {};
    if (domain_filter?.length) filters.search_domain_filter = domain_filter;
    if (recency) filters.search_recency_filter = recency;

    const webSearchTool: Record<string, unknown> = { type: "web_search" };
    if (Object.keys(filters).length > 0) webSearchTool.filters = filters;
    tools.push(webSearchTool);
    tools.push({ type: "fetch_url" });

    try {
      const response = await client.responses.create({
        preset: "pro-search",
        input: query,
        tools,
        response_format: {
          type: "json_schema",
          json_schema: jsonSchema,
        },
      });

      let parsed: unknown;
      try {
        parsed = JSON.parse(response.output_text);
      } catch {
        parsed = null;
      }

      return {
        success: true,
        data: parsed,
        raw_text: parsed ? undefined : response.output_text,
        model: response.model,
        cost: response.usage?.cost,
        usage: {
          input_tokens: response.usage?.input_tokens,
          output_tokens: response.usage?.output_tokens,
        },
        _hint: "Structured data extracted. Use ingest_comps or store_knowledge_entry to persist.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Perplexity structured extract failed: ${message}` };
    }
  },
});

/**
 * Deep research for investment memos and comprehensive analysis.
 * Uses advanced-deep-research preset (Claude Opus 4.6, 10 steps).
 */
export const perplexity_deep_research = tool({
  name: "perplexity_deep_research",
  description:
    "Conduct institutional-grade deep research using Perplexity AI. " +
    "Uses Claude Opus 4.6 with up to 10 research steps for maximum depth. " +
    "Use this for investment memo market sections, comprehensive due diligence research, " +
    "competitive landscape analysis, and regulatory environment assessments. " +
    "Expensive — reserve for high-value analysis that justifies the cost.",
  parameters: z.object({
    query: z.string().describe(
      "Detailed research question. Include property type, geography, " +
      "time horizon, and what aspects to cover (supply/demand, demographics, " +
      "infrastructure, regulatory, comparable transactions, etc.)"
    ),
    domain_filter: z.array(z.string()).nullable()
      .describe("Limit search to specific domains. null = all."),
  }),
  execute: async ({ query, domain_filter }) => {
    const client = getClient();

    const tools: Array<Record<string, unknown>> = [];
    const webSearchTool: Record<string, unknown> = { type: "web_search" };
    if (domain_filter?.length) {
      webSearchTool.filters = { search_domain_filter: domain_filter };
    }
    tools.push(webSearchTool);
    tools.push({ type: "fetch_url" });

    try {
      const response = await client.responses.create({
        preset: "advanced-deep-research",
        input: query,
        tools,
      });

      const sources: Array<{ title: string; url: string; date?: string }> = [];
      for (const item of response.output ?? []) {
        if ((item as any).type === "search_results") {
          for (const result of (item as any).results ?? []) {
            sources.push({ title: result.title, url: result.url, date: result.date });
          }
        }
      }

      return {
        success: true,
        text: response.output_text,
        sources,
        model: response.model,
        cost: response.usage?.cost,
        usage: {
          input_tokens: response.usage?.input_tokens,
          output_tokens: response.usage?.output_tokens,
        },
        _hint:
          "Deep research complete. This content is suitable for investment memo sections. " +
          "Use generate_artifact to create the memo, or store_knowledge_entry to cache findings.",
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Perplexity deep research failed: ${message}` };
    }
  },
});

/**
 * Quick factual lookup via Perplexity fast-search.
 * Cheapest option — uses xAI Grok, single search step.
 */
export const perplexity_quick_lookup = tool({
  name: "perplexity_quick_lookup",
  description:
    "Quick factual web lookup using Perplexity AI fast-search. " +
    "Cheapest and fastest option — single search step with xAI Grok. " +
    "Use for simple questions: parcel owner lookups, current zoning, " +
    "business name verification, phone numbers, addresses. " +
    "NOT suitable for complex research or analysis.",
  parameters: z.object({
    query: z.string().describe(
      "Simple factual question. Example: 'Who owns 5555 Plank Rd, Baton Rouge, LA?'"
    ),
  }),
  execute: async ({ query }) => {
    const client = getClient();

    try {
      const response = await client.responses.create({
        preset: "fast-search",
        input: query,
      });

      return {
        success: true,
        text: response.output_text,
        model: response.model,
        cost: response.usage?.cost,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: `Perplexity quick lookup failed: ${message}` };
    }
  },
});
```

**MODIFY** `packages/openai/src/tools/index.ts` — add imports and wire into `entitlementOsTools`:

```typescript
// Add at top with other imports:
import * as perplexityTools from "./perplexityTools.js";

// Add destructuring:
const {
  perplexity_web_research,
  perplexity_structured_extract,
  perplexity_deep_research,
  perplexity_quick_lookup,
} = perplexityTools;

// Add named exports:
export {
  perplexity_web_research,
  perplexity_structured_extract,
  perplexity_deep_research,
  perplexity_quick_lookup,
} from "./perplexityTools.js";

// Inside the entitlementOsTools IIFE array, after `browser_task`:
    // Perplexity web research tools
    perplexity_web_research,
    perplexity_structured_extract,
    perplexity_deep_research,
    perplexity_quick_lookup,
```

**MODIFY** `packages/openai/package.json` — add dependency:

```json
{
  "dependencies": {
    "@perplexity-ai/perplexity_ai": "^1.0.0"
  }
}
```

**MODIFY** `.env.example` — add:

```
PERPLEXITY_API_KEY=       # Perplexity Agent API key (https://console.perplexity.ai)
```

---

## 2.2 Implementation: Market Trajectory Agent — Deep Research Preset

### Problem
The Market Trajectory agent (`market-trajectory-agent/marketTrajectory.ts`) currently relies on `queryBuildingPermits` (Socrata), `searchNearbyPlaces` (Google), `get_area_summary`, and `query_market_data` for market intelligence. These are local/structured data sources — no live web research capability.

### Solution
Add `perplexity_web_research` and `perplexity_structured_extract` to the Market Trajectory agent's tool set so it can pull live market data: recent project announcements, absorption reports, developer activity, vacancy trends.

### Files to Modify

**MODIFY** `packages/openai/src/tools/index.ts` — add Perplexity tools to `marketTrajectoryTools`:

```typescript
export const marketTrajectoryTools = [
  queryBuildingPermits,
  searchNearbyPlaces,
  get_area_summary,
  get_poi_density,
  getDealContext,
  searchParcels,
  getParcelDetails,
  search_knowledge_base,
  store_knowledge_entry,
  share_analysis_finding,
  get_shared_context,
  log_reasoning_trace,
  query_market_data,
  search_comparable_sales,
  analyze_market_workflow,
  // NEW: Perplexity web research for live market intelligence
  perplexity_web_research,
  perplexity_structured_extract,
];
```

**MODIFY** `market-trajectory-agent/marketTrajectory.ts` — update agent instructions to include Perplexity tool guidance:

Add to the agent's system prompt / instructions:

```
## Web Research Tools

You have access to Perplexity web research tools for live market intelligence:

- **perplexity_web_research**: Use for market news, development pipeline updates,
  absorption reports, and developer activity. Use preset "deep-research" for
  comprehensive market trajectory analysis. Filter to CRE-relevant domains:
  ["costar.com", "loopnet.com", "theadvocate.com", "businessreport.com",
   "nola.com", "crexi.com", "commercialcafe.com"]

- **perplexity_structured_extract**: Use schema_type "market_metrics" to pull
  structured vacancy rates, absorption, rental rates, cap rates. Use
  "comparable_sales" for recent transaction data. Use "permit_data" for
  construction pipeline.

ROUTING RULES:
- Use perplexity_web_research for qualitative analysis (trends, news, developer plans)
- Use perplexity_structured_extract for quantitative data (metrics, comps, permits)
- Use queryBuildingPermits for official Socrata permit records (authoritative)
- Use searchNearbyPlaces / get_area_summary for POI and area context
- ALWAYS cross-reference web research against local DB data when available
```

---

## 2.3 Implementation: Regulatory & Zoning Research Without CUA

### Problem
Legal and Entitlements agents need planning commission minutes, zoning amendments, permit filings, and regulatory updates. Currently this requires `browser_task` (slow, expensive) or manual research.

### Solution
`perplexity_web_research` with domain filters for government sources handles most regulatory research without browser automation.

### Files to Modify

**MODIFY** `packages/openai/src/agents/entitlement-os.ts` — add guidance to the unified agent's system prompt:

Add to the existing "Browser Automation" or tools section of the EntitlementOS agent instructions:

```
## Web Research (Perplexity)

You have four Perplexity-powered tools for web research:

| Tool | When to Use | Cost |
|------|-------------|------|
| perplexity_quick_lookup | Simple facts: owner name, current zoning, business info | ~$0.01 |
| perplexity_web_research | Market research, news, regulatory updates, comp analysis | ~$0.02-0.05 |
| perplexity_structured_extract | Machine-readable data: comps, metrics, permits, filings | ~$0.02-0.05 |
| perplexity_deep_research | Investment memo sections, comprehensive market analysis | ~$0.10-0.50 |

ROUTING vs. browser_task:
- USE Perplexity for: public web content, news, government sites, market data, regulatory filings
- USE browser_task ONLY for: sites requiring login, interactive forms, JavaScript-heavy SPAs,
  county assessor portals that block API access, LACDB

REGULATORY RESEARCH PATTERN:
When researching zoning or regulatory issues, use perplexity_web_research with:
  - domain_filter: ["brla.gov", "ebrp.org", "ladotd.org", "deq.louisiana.gov", "dnr.louisiana.gov"]
  - recency: "month" (for recent changes) or "year" (for historical context)

ZONING AMENDMENT RESEARCH:
1. First check local DB: zoningMatrixLookup, parishPackLookup
2. If DB data is insufficient or outdated, use perplexity_web_research to find recent amendments
3. Cross-reference web findings against DB data
4. Store verified findings via store_knowledge_entry
```

---

## 2.4 Implementation: Structured Comp Data Extraction

### Problem
Comparable sales data currently comes from `search_comparable_sales` (internal DB), `analyze_comparable_sales` (deal context), and manual research. No automated way to pull live comp data from the web in machine-readable format.

### Solution
`perplexity_structured_extract` with the `comparable_sales` schema type returns JSON-structured comp data ready for DB ingestion via `ingest_comps`.

### Workflow (No Additional Code Needed)

The agent already has both tools. The workflow is:

1. Agent calls `perplexity_structured_extract` with `schema_type: "comparable_sales"` and a query like "Recent truck parking facility sales in Louisiana 2025-2026"
2. Perplexity returns structured JSON with address, price, acres, cap_rate, etc.
3. Agent calls `ingest_comps` with the returned data to persist to the knowledge base
4. Agent calls `store_knowledge_entry` to cache the research for future retrieval

**Add to agent instructions** (already covered in 2.3 above):

```
COMP DATA EXTRACTION WORKFLOW:
1. perplexity_structured_extract(schema_type="comparable_sales", query="...")
2. Validate returned data (check for reasonable values)
3. ingest_comps(data) to persist to comp database
4. store_knowledge_entry to cache the full research context
```

---

## 2.5 Implementation: Deep Research for Investment Memos

### Problem
`generate_artifact` creates investment memos (INVESTMENT_MEMO_PDF) but the market analysis sections rely on whatever data the agent has in context. No dedicated deep research step.

### Solution
`perplexity_deep_research` (advanced-deep-research preset: Claude Opus 4.6, 10 steps) produces institutional-quality market analysis with cited sources, which feeds directly into `generate_artifact`.

### Workflow (No Additional Code Needed)

The agent already has both tools. The pattern is:

1. When generating an investment memo, the agent first calls `perplexity_deep_research` with a comprehensive market analysis query
2. The deep research response (with sources) becomes context for `generate_artifact(type: "INVESTMENT_MEMO_PDF")`
3. Sources from Perplexity are included in the memo's citations

**Add to agent instructions** (in the Artifacts section of entitlement-os.ts):

```
INVESTMENT MEMO WORKFLOW (enhanced):
Before generating INVESTMENT_MEMO_PDF or OFFERING_MEMO_PDF:
1. Call perplexity_deep_research with a comprehensive query covering:
   - Supply/demand dynamics for the property type in the target geography
   - Competitive landscape and comparable facilities
   - Demographic trends and economic indicators
   - Infrastructure plans and development pipeline
   - Regulatory environment and entitlement considerations
   - Recent comparable transactions
2. Store the research via store_knowledge_entry for reuse
3. Generate the artifact with the deep research context included
4. Include Perplexity sources in the memo's source citations
```

---

## 2.6 Summary: Files Changed

| File | Action | Purpose |
|------|--------|---------|
| `packages/openai/src/tools/perplexityTools.ts` | **CREATE** | 4 new tools: quick_lookup, web_research, structured_extract, deep_research |
| `packages/openai/src/tools/index.ts` | **MODIFY** | Import + wire 4 Perplexity tools into `entitlementOsTools` and `marketTrajectoryTools` |
| `packages/openai/package.json` | **MODIFY** | Add `@perplexity-ai/perplexity_ai` dependency |
| `packages/openai/src/agents/entitlement-os.ts` | **MODIFY** | Add web research routing rules and workflow patterns to agent instructions |
| `market-trajectory-agent/marketTrajectory.ts` | **MODIFY** | Add Perplexity tool guidance to agent instructions |
| `.env.example` | **MODIFY** | Add `PERPLEXITY_API_KEY` placeholder |
| `apps/web/.env.local` | **MODIFY** | Add actual `PERPLEXITY_API_KEY` value |
| Vercel environment | **MODIFY** | Add `PERPLEXITY_API_KEY` env var |

## 2.7 Build Sequence

1. **Get API key** from https://console.perplexity.ai
2. **Add env var** to `.env.local` and Vercel
3. **Install SDK:** `cd packages/openai && npm install @perplexity-ai/perplexity_ai`
4. **Create** `perplexityTools.ts`
5. **Wire into** `index.ts` (imports, destructuring, exports, entitlementOsTools array, marketTrajectoryTools array)
6. **Update agent prompts** in `entitlement-os.ts` and `marketTrajectory.ts`
7. **Build:** `npm run build` from monorepo root
8. **Test locally:** Chat with agent, ask "What are recent industrial land sales in East Baton Rouge Parish?" — should use `perplexity_web_research` instead of `browser_task`
9. **Deploy:** Push to trigger Vercel deployment

## 2.8 Cost Estimates

| Use Case | Preset | Est. Cost/Call | Monthly Volume | Monthly Cost |
|----------|--------|----------------|----------------|--------------|
| Quick lookups (owner, zoning) | fast-search | ~$0.005 | 200 | $1 |
| Market research | pro-search | ~$0.03 | 100 | $3 |
| Structured comp extraction | pro-search | ~$0.04 | 50 | $2 |
| Investment memo research | advanced-deep-research | ~$0.30 | 10 | $3 |
| **Total** | | | | **~$9/mo** |

Compare to CUA browser automation: GPT-5.4 vision tokens + Playwright compute + Docker overhead = significantly more per equivalent task.

## 2.9 What Stays on CUA (`browser_task`)

`browser_task` is NOT replaced. It's still needed for:

- **County assessor portals** (often require JavaScript interaction, CAPTCHAs)
- **LACDB** (Louisiana Construction and Design Bid database)
- **Sites behind login** (MLS, CoStar authenticated, proprietary databases)
- **Interactive maps** (parish GIS viewers that require click-to-query)
- **Form submission** (permit applications, FOIA requests)

The agent prompt routing rules (Section 2.3) tell the agent when to use Perplexity vs. CUA.
