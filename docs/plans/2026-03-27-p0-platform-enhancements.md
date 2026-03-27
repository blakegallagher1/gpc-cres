# P0 Platform Enhancements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the 7 highest-priority patterns from the OpenAI SDK analysis — server-side compaction, strict JSON schema, approval gates, domain secrets, tool timeouts, and prompt caching optimizations.

**Architecture:** These patterns touch the Responses API call layer (CUA worker + agent runner), tool registration (packages/openai), and security boundaries. They are largely independent and can be implemented in parallel.

**Tech Stack:** TypeScript, OpenAI Responses API, @openai/agents SDK, Zod, Fastify

---

### Task 1: Strict JSON Schema Validation Utility (Pattern 1)

**Files:**
- Create: `packages/openai/src/utils/strictJsonSchema.ts`
- Create: `packages/openai/src/utils/__tests__/strictJsonSchema.test.ts`

**Step 1: Write failing tests**

```typescript
import { describe, it, expect } from "vitest";
import { ensureStrictJsonSchema } from "../strictJsonSchema.js";

describe("ensureStrictJsonSchema", () => {
  it("removes format: uri from string properties", () => {
    const schema = {
      type: "object",
      properties: { url: { type: "string", format: "uri" } },
    };
    const result = ensureStrictJsonSchema(schema);
    expect(result.properties.url.format).toBeUndefined();
  });

  it("removes format: email from string properties", () => {
    const schema = {
      type: "object",
      properties: { email: { type: "string", format: "email" } },
    };
    const result = ensureStrictJsonSchema(schema);
    expect(result.properties.email.format).toBeUndefined();
  });

  it("adds additionalProperties: false to all objects", () => {
    const schema = {
      type: "object",
      properties: { name: { type: "string" } },
    };
    const result = ensureStrictJsonSchema(schema);
    expect(result.additionalProperties).toBe(false);
  });

  it("ensures required includes all property keys", () => {
    const schema = {
      type: "object",
      properties: { a: { type: "string" }, b: { type: "number" } },
      required: ["a"],
    };
    const result = ensureStrictJsonSchema(schema);
    expect(new Set(result.required)).toEqual(new Set(["a", "b"]));
  });

  it("recursively processes nested objects", () => {
    const schema = {
      type: "object",
      properties: {
        nested: {
          type: "object",
          properties: { url: { type: "string", format: "uri" } },
        },
      },
    };
    const result = ensureStrictJsonSchema(schema);
    expect(result.properties.nested.additionalProperties).toBe(false);
    expect(result.properties.nested.properties.url.format).toBeUndefined();
  });

  it("processes array items", () => {
    const schema = {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string", format: "uuid" } },
          },
        },
      },
    };
    const result = ensureStrictJsonSchema(schema);
    expect(result.properties.items.items.properties.id.format).toBeUndefined();
    expect(result.properties.items.items.additionalProperties).toBe(false);
  });

  it("preserves enum and const values", () => {
    const schema = {
      type: "object",
      properties: {
        status: { type: "string", enum: ["active", "inactive"] },
        version: { type: "number", const: 1 },
      },
    };
    const result = ensureStrictJsonSchema(schema);
    expect(result.properties.status.enum).toEqual(["active", "inactive"]);
    expect(result.properties.version.const).toBe(1);
  });

  it("is a no-op on already-compliant schemas", () => {
    const schema = {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
      additionalProperties: false,
    };
    const result = ensureStrictJsonSchema(schema);
    expect(result).toEqual(schema);
  });
});
```

Run: `pnpm vitest run packages/openai/src/utils/__tests__/strictJsonSchema.test.ts`
Expected: FAIL (module not found)

**Step 2: Implement the utility**

```typescript
/**
 * Recursively sanitizes a JSON schema to conform to OpenAI's strict mode.
 * Ports the Python SDK's ensure_strict_json_schema() to TypeScript.
 *
 * - Removes unsupported format constraints (uri, email, uuid, etc.)
 * - Adds additionalProperties: false to all objects
 * - Ensures required arrays include all property keys
 */

const UNSUPPORTED_FORMATS = new Set([
  "uri", "url", "email", "hostname", "ipv4", "ipv6",
  "date", "date-time", "time", "duration", "uuid",
  "regex", "json-pointer", "relative-json-pointer",
  "uri-reference", "uri-template", "iri", "iri-reference",
]);

export function ensureStrictJsonSchema(schema: Record<string, unknown>): Record<string, unknown> {
  if (!schema || typeof schema !== "object") return schema;
  return processNode({ ...schema }, new Set());
}

function processNode(
  node: Record<string, unknown>,
  visited: Set<Record<string, unknown>>,
): Record<string, unknown> {
  if (!node || typeof node !== "object" || visited.has(node)) return node;
  visited.add(node);

  // Remove unsupported format constraints
  if (typeof node.format === "string" && UNSUPPORTED_FORMATS.has(node.format)) {
    delete node.format;
  }

  // Remove other constraints OpenAI rejects
  for (const key of ["pattern", "minLength", "maxLength", "minimum", "maximum",
    "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minItems", "maxItems",
    "uniqueItems", "minProperties", "maxProperties"]) {
    if (key in node) delete node[key];
  }

  // Process object type
  if (node.type === "object" && node.properties && typeof node.properties === "object") {
    node.additionalProperties = false;

    const props = node.properties as Record<string, Record<string, unknown>>;
    const propKeys = Object.keys(props);

    // Ensure required includes all property keys
    node.required = propKeys;

    // Recursively process property schemas
    for (const key of propKeys) {
      props[key] = processNode({ ...props[key] }, visited);
    }
  }

  // Process array items
  if (node.type === "array" && node.items && typeof node.items === "object") {
    node.items = processNode({ ...(node.items as Record<string, unknown>) }, visited);
  }

  // Process anyOf/oneOf/allOf
  for (const combiner of ["anyOf", "oneOf", "allOf"] as const) {
    if (Array.isArray(node[combiner])) {
      node[combiner] = (node[combiner] as Record<string, unknown>[]).map(
        (sub) => processNode({ ...sub }, visited),
      );
    }
  }

  // Process $defs
  if (node.$defs && typeof node.$defs === "object") {
    const defs = node.$defs as Record<string, Record<string, unknown>>;
    for (const key of Object.keys(defs)) {
      defs[key] = processNode({ ...defs[key] }, visited);
    }
  }

  return node;
}
```

**Step 3: Run tests**

Run: `pnpm vitest run packages/openai/src/utils/__tests__/strictJsonSchema.test.ts`
Expected: PASS

**Step 4: Commit**

```bash
git add packages/openai/src/utils/strictJsonSchema.ts packages/openai/src/utils/__tests__/strictJsonSchema.test.ts
git commit -m "feat(schema): add ensureStrictJsonSchema utility (Pattern 1)"
```

---

### Task 2: Tool Timeout Configuration Registry (Pattern 10)

**Files:**
- Create: `packages/openai/src/utils/toolTimeouts.ts`

**Step 1: Create timeout registry**

```typescript
export type ToolTimeoutConfig = {
  timeoutMs: number;
  errorStrategy: "error_as_result" | "raise_exception";
};

export const TOOL_TIMEOUTS: Record<string, ToolTimeoutConfig> = {
  // Browser — full interaction loop
  browser_task: { timeoutMs: 120_000, errorStrategy: "error_as_result" },

  // Property DB — gateway queries
  search_parcels: { timeoutMs: 15_000, errorStrategy: "error_as_result" },
  get_parcel_details: { timeoutMs: 15_000, errorStrategy: "error_as_result" },
  screen_batch: { timeoutMs: 60_000, errorStrategy: "error_as_result" },
  query_property_db_sql: { timeoutMs: 15_000, errorStrategy: "error_as_result" },

  // Knowledge/memory — lightweight lookups
  search_knowledge_base: { timeoutMs: 5_000, errorStrategy: "error_as_result" },
  store_knowledge_entry: { timeoutMs: 5_000, errorStrategy: "error_as_result" },
  recall_property_intelligence: { timeoutMs: 5_000, errorStrategy: "error_as_result" },
  store_property_finding: { timeoutMs: 5_000, errorStrategy: "error_as_result" },
  get_entity_memory: { timeoutMs: 5_000, errorStrategy: "error_as_result" },

  // Default
  _default: { timeoutMs: 30_000, errorStrategy: "error_as_result" },
};

export function getToolTimeout(toolName: string): ToolTimeoutConfig {
  return TOOL_TIMEOUTS[toolName] ?? TOOL_TIMEOUTS._default;
}

export function formatTimeoutError(toolName: string, timeoutMs: number): string {
  return `Tool '${toolName}' timed out after ${timeoutMs / 1000}s. Try a simpler query or check service health.`;
}
```

**Step 2: Commit**

```bash
git add packages/openai/src/utils/toolTimeouts.ts
git commit -m "feat(tools): add tool timeout configuration registry (Pattern 10)"
```

---

### Task 3: Server-Side Auto-Compaction + Cache Key (Patterns 23, 35)

**Files:**
- Modify: `infra/cua-worker/src/responses-loop.ts` (~line 370, the `client.responses.create` call)

**Step 1: Add context_management and prompt_cache_key**

In the `client.responses.create()` call inside `runNativeComputerLoop`, add:

```typescript
response = (await client.responses.create(
  {
    model,
    instructions: systemInstructions,
    input: nextInput as any,
    tools: [{ type: "computer" } as any],
    reasoning: { effort: "low" },
    truncation: "auto",
    context_management: [{ compact_threshold: 200_000 }],
    prompt_cache_key: "entitlement-os-cua-v1",
    ...(previousResponseId
      ? { previous_response_id: previousResponseId }
      : {}),
  } as any,
  { signal },
)) as ResponsesApiResponse;
```

**Step 2: Commit**

```bash
git add infra/cua-worker/src/responses-loop.ts
git commit -m "feat(cua): enable server-side auto-compaction and prompt cache key (Patterns 23, 35)"
```

---

### Task 4: Prefix Stability — Lock Tool Ordering (Pattern 36)

**Files:**
- Create: `packages/openai/src/utils/toolStability.ts`
- Modify: `packages/openai/src/tools/index.ts` (sort tools before export)

**Step 1: Create sorting utility**

```typescript
export function sortToolsByName<T extends { name?: string }>(tools: T[]): T[] {
  return [...tools].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}
```

**Step 2: Apply to tool export**

In `packages/openai/src/tools/index.ts`, before the final export of the tools array, wrap with `sortToolsByName()`.

**Step 3: Commit**

```bash
git add packages/openai/src/utils/toolStability.ts packages/openai/src/tools/index.ts
git commit -m "feat(cache): lock tool ordering for prefix stability (Pattern 36)"
```

---

### Task 5: Domain Secrets Configuration (Pattern 26)

**Files:**
- Create: `packages/openai/src/utils/domainSecrets.ts`

**Step 1: Create domain secrets config**

```typescript
const DOMAIN_SECRETS: Record<string, { envVar: string; headerName: string; format: string }> = {
  "api.gallagherpropco.com": {
    envVar: "LOCAL_API_KEY",
    headerName: "Authorization",
    format: "Bearer {value}",
  },
  "cua.gallagherpropco.com": {
    envVar: "LOCAL_API_KEY",
    headerName: "Authorization",
    format: "Bearer {value}",
  },
};

export function getSecretHeadersForDomain(url: string): Record<string, string> {
  try {
    const hostname = new URL(url).hostname;
    const config = DOMAIN_SECRETS[hostname];
    if (!config) return {};
    const value = process.env[config.envVar];
    if (!value) return {};
    return { [config.headerName]: config.format.replace("{value}", value) };
  } catch {
    return {};
  }
}
```

**Step 2: Commit**

```bash
git add packages/openai/src/utils/domainSecrets.ts
git commit -m "feat(security): add domain secrets credential injection config (Pattern 26)"
```

---

### Task 6: needs_approval on High-Stakes Tools (Pattern 8)

**Files:**
- Modify: Tools that should require approval (identify exact files by grepping for tool names)

**Step 1: Check SDK support**

Grep `packages/openai` and `node_modules/@openai/agents` for `needs_approval` or `needsApproval` to verify the TypeScript SDK supports this property on `tool()` definitions.

**Step 2: Add to high-stakes tools**

If supported, add `needs_approval: true` to:
- `generate_artifact` in artifact tools
- `store_knowledge_entry` in knowledge tools
- Any buyer outreach tools

If NOT supported in the TS SDK yet, document the gap and create an issue to revisit when SDK support lands.

**Step 3: Commit**

```bash
git add packages/openai/src/tools/*.ts
git commit -m "feat(safety): add needs_approval gates to high-stakes tools (Pattern 8)"
```

---

### Task 7: Full Verification Gate

**Step 1:** `pnpm typecheck` — all packages
**Step 2:** `pnpm test` — all test suites
**Step 3:** `pnpm build` — all packages build cleanly
**Step 4:** Verify CUA worker builds: `pnpm -C infra/cua-worker run build`

---

## Summary

| Task | Patterns | Files Changed | Estimated Lines |
|------|----------|---------------|----------------|
| 1. Strict JSON Schema | #1 | 2 new | ~120 |
| 2. Tool Timeouts | #10 | 1 new | ~50 |
| 3. Compaction + Cache Key | #23, #35 | 1 modified | ~5 |
| 4. Prefix Stability | #36 | 1 new, 1 modified | ~15 |
| 5. Domain Secrets | #26 | 1 new | ~35 |
| 6. Approval Gates | #8 | 2-3 modified | ~10 |
| 7. Verification | — | — | — |
