# CUA Browser Agent Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Give the EntitlementOS agent browser automation capabilities via GPT-5.4 native computer use, with a CUA worker on the Windows server, model toggle in the chat UI, streaming screenshot display, and knowledge base integration for saving fetched data.

**Architecture:** A new Docker container (`gpc-cua-worker`) runs a Fastify server with the OpenAI Responses API computer_call loop (ported from the CUA sample app). The EntitlementOS agent calls it via a `browser_task` tool through the Cloudflare tunnel. The chat UI shows live screenshots during execution and a model toggle (gpt-5.4 / gpt-5.4-mini).

**Tech Stack:** TypeScript, OpenAI Responses API (computer_call), Playwright + Chromium, Fastify, Docker, Cloudflare Tunnel, SSE streaming

**Design doc:** `docs/plans/2026-03-25-cua-browser-agent-design.md`

**Reference implementation:** `/Users/gallagherpropertycompany/Documents/CUA/openai-cua-sample-app/`

---

### Task 1: Create the CUA worker project structure

**Files:**
- Create: `infra/cua-worker/package.json`
- Create: `infra/cua-worker/tsconfig.json`
- Create: `infra/cua-worker/Dockerfile`
- Create: `infra/cua-worker/.env.example`

**Step 1: Create package.json**

```json
{
  "name": "gpc-cua-worker",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc",
    "start": "node dist/server.js"
  },
  "dependencies": {
    "fastify": "^5.0.0",
    "openai": "^5.0.0",
    "playwright": "^1.50.0",
    "zod": "^3.24.0"
  },
  "devDependencies": {
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "@types/node": "^22.0.0"
  }
}
```

**Step 2: Create Dockerfile**

```dockerfile
FROM node:22-slim

# Install Playwright system deps + Chromium
RUN npx playwright install --with-deps chromium

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN npm install --production
COPY dist/ ./dist/

ENV PORT=3001
ENV NODE_ENV=production
EXPOSE 3001

CMD ["node", "dist/server.js"]
```

**Step 3: Create .env.example**

```env
OPENAI_API_KEY=sk-...
PORT=3001
BROWSER_MODE=headless
DEFAULT_MODEL=gpt-5.4
MAX_TURNS=24
SCREENSHOT_DIR=/tmp/cua-screenshots
```

**Step 4: Create tsconfig.json**

Standard Node.js ESM TypeScript config targeting ES2022, moduleResolution: NodeNext.

**Step 5: Commit**

```bash
git add infra/cua-worker/
git commit -m "feat(cua): scaffold CUA worker project structure"
```

---

### Task 2: Port the Responses API computer_call loop

**Files:**
- Create: `infra/cua-worker/src/responses-loop.ts`
- Create: `infra/cua-worker/src/browser-session.ts`
- Create: `infra/cua-worker/src/types.ts`

**Step 1: Create types.ts**

Define the core types: `TaskRequest`, `TaskResult`, `TaskEvent`, `ComputerAction`, `BrowserSessionState`. Reference the CUA sample app's `responses-loop.ts` (917 lines) and `browser-runtime/index.ts` (147 lines) for the type shapes.

Key types:
```typescript
export type TaskRequest = {
  url: string;
  instructions: string;
  model: "gpt-5.4" | "gpt-5.4-mini";
  mode?: "native" | "code" | "auto";
  playbook?: {
    strategy?: string;       // Natural language navigation hints
    codeSnippet?: string;    // JavaScript to execute in code mode
    selectors?: Record<string, string>;  // CSS selectors that worked before
  };
  maxTurns?: number;
};

export type TaskResult = {
  success: boolean;
  data: unknown;
  error?: string;
  screenshots: string[];    // Paths to screenshot PNGs
  turns: number;
  modeUsed: "native" | "code";
  cost: { inputTokens: number; outputTokens: number };
  source: { url: string; fetchedAt: string };
};

export type TaskEvent = {
  type: "screenshot" | "action" | "error" | "complete";
  turn: number;
  timestamp: string;
  screenshotPath?: string;
  action?: string;
  data?: unknown;
};
```

**Step 2: Create browser-session.ts**

Port from the CUA sample app's `browser-runtime/index.ts` (147 lines). This is a thin Playwright wrapper:
- `launchBrowserSession(options)` — launches Chromium, navigates to URL, returns session handle
- `captureScreenshot(label)` — takes PNG screenshot, returns path + metadata
- `readState()` — returns current URL + page title
- `close()` — cleans up browser

Keep it nearly identical to the sample app — it's already clean and minimal.

**Step 3: Create responses-loop.ts**

Port the core loop from the CUA sample app's `responses-loop.ts`. The key function:

```typescript
export async function runNativeComputerLoop(options: {
  client: OpenAI;
  model: string;
  session: BrowserSession;
  instructions: string;
  playbook?: TaskRequest["playbook"];
  maxTurns: number;
  onEvent: (event: TaskEvent) => void;
  signal: AbortSignal;
}): Promise<TaskResult>
```

The loop:
1. Capture initial screenshot
2. Build prompt: instructions + playbook hints (if any) + screenshot
3. Call `client.responses.create()` with `computer_call` tool
4. For each `computer_call` action: execute on browser (click/type/scroll/screenshot)
5. Send `computer_call_output` with updated screenshot
6. Use `previous_response_id` for turn chaining
7. Emit `TaskEvent` on each turn (for SSE streaming)
8. Loop until model returns message (no more actions) or maxTurns hit
9. Parse model's final text as JSON data (if structured extraction requested)
10. Return `TaskResult`

Also implement `runCodeMode()` for executing proven JavaScript playbooks directly via `page.evaluate()`, falling back to native mode on failure.

**Step 4: Commit**

```bash
git add infra/cua-worker/src/
git commit -m "feat(cua): port Responses API computer_call loop and browser session"
```

---

### Task 3: Create the Fastify HTTP server

**Files:**
- Create: `infra/cua-worker/src/server.ts`

**Step 1: Implement server**

Port from the CUA sample app's `server.ts` (202 lines), simplified for our use case. Endpoints:

```
GET  /health                  — { status: "ok", browser: "ready" }
POST /tasks                   — Start a browser task, returns { taskId, eventStreamUrl }
GET  /tasks/:id               — Get task result
GET  /tasks/:id/events        — SSE stream of TaskEvents (screenshots, actions)
GET  /tasks/:id/screenshots/:name — Serve screenshot PNGs
```

`POST /tasks` body matches `TaskRequest`. Auth via Bearer token (same `LOCAL_API_KEY` as the gateway).

The task runs async: POST returns 202 immediately with `taskId` + `eventStreamUrl`. The browser session runs in the background, publishing events. Client subscribes to SSE for live updates.

**Step 2: Add auth middleware**

Check `Authorization: Bearer` header against `API_KEY` env var. Same pattern as the gateway.

**Step 3: Commit**

```bash
git add infra/cua-worker/src/server.ts
git commit -m "feat(cua): add Fastify HTTP server with task endpoints and SSE streaming"
```

---

### Task 4: Build Docker image and add to docker-compose

**Files:**
- Modify: `infra/docker/docker-compose.yml` (or the Windows server's compose file)

**Step 1: Build and test locally (if possible)**

```bash
cd infra/cua-worker
npm install
npx tsc
# Test locally if Mac has Playwright installed:
OPENAI_API_KEY=$OPENAI_API_KEY node dist/server.js
```

**Step 2: Add to docker-compose**

```yaml
cua-worker:
  build:
    context: ./infra/cua-worker
    dockerfile: Dockerfile
  container_name: gpc-cua-worker
  restart: unless-stopped
  environment:
    - OPENAI_API_KEY=${OPENAI_API_KEY}
    - API_KEY=${GATEWAY_API_KEY}
    - PORT=3001
    - BROWSER_MODE=headless
    - DEFAULT_MODEL=gpt-5.4
    - MAX_TURNS=24
  ports:
    - "127.0.0.1:3001:3001"
  volumes:
    - /tmp/cua-data:/tmp/cua-data
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:3001/health"]
    interval: 30s
    timeout: 10s
    retries: 3
```

**Step 3: Deploy to Windows server via SSH**

```bash
scp -r infra/cua-worker/ cres_admin@ssh.gallagherpropco.com:cua-worker/
ssh cres_admin@ssh.gallagherpropco.com "cd cua-worker && docker build -t gpc-cua-worker . && docker run -d --name gpc-cua-worker --restart unless-stopped -p 127.0.0.1:3001:3001 -e OPENAI_API_KEY=... -e API_KEY=... gpc-cua-worker"
```

**Step 4: Add Cloudflare tunnel route**

SSH into the server, update the cloudflared config to add:
```
cua.gallagherpropco.com → http://gpc-cua-worker:3001
```

Or add via the Cloudflare dashboard if the tunnel is remotely managed.

**Step 5: Verify**

```bash
curl https://cua.gallagherpropco.com/health
# Expected: { "status": "ok", "browser": "ready" }
```

**Step 6: Commit**

```bash
git add infra/cua-worker/ infra/docker/
git commit -m "feat(cua): Docker image and tunnel route for CUA worker"
```

---

### Task 5: Create the `browser_task` agent tool

**Files:**
- Create: `packages/openai/src/tools/browserTools.ts`
- Modify: `packages/openai/src/tools/index.ts` — add to `entitlementOsTools`

**Step 1: Implement the tool**

```typescript
import { tool } from "@openai/agents";
import { z } from "zod";

export const browser_task = tool({
  name: "browser_task",
  description:
    "Navigate to a website and perform tasks using a real browser. " +
    "Use this when you need to look up data on external websites like county assessor portals, " +
    "LACDB, FEMA maps, parish clerk sites, or any other web resource. " +
    "Returns structured data extracted from the page plus screenshots.",
  parameters: z.object({
    url: z.string().describe("The URL to navigate to"),
    instructions: z.string().describe(
      "Natural language instructions for what to do on the site and what data to extract. " +
      "Be specific about what data fields you need."
    ),
    model: z.enum(["gpt-5.4", "gpt-5.4-mini"]).nullable()
      .describe("Vision model for browser automation. null = use user's preference."),
  }),
  execute: async ({ url, instructions, model }, context) => {
    const orgId = context.orgId;
    const cuaModel = model ?? "gpt-5.4";

    // Check knowledge base for existing site playbook
    // (implementation details: search knowledge_embeddings for the domain)
    const domain = new URL(url).hostname;
    // ... retrieve playbook if exists ...

    // Call CUA worker
    const cuaUrl = process.env.CUA_WORKER_URL ?? "https://cua.gallagherpropco.com";
    const apiKey = process.env.LOCAL_API_KEY;

    const response = await fetch(`${cuaUrl}/tasks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url,
        instructions,
        model: cuaModel,
        mode: "auto",
        // playbook from knowledge base (if found)
      }),
    });

    if (!response.ok) {
      return { error: `CUA worker error: ${response.status}` };
    }

    const result = await response.json();

    // If successful, suggest saving to knowledge base
    return {
      ...result,
      _hint: result.success
        ? "Data extracted successfully. Ask the user if they want to save this to the knowledge base."
        : "Browser task failed. Show the user the last screenshot and ask for guidance.",
    };
  },
});
```

**Step 2: Add to entitlementOsTools array**

In `packages/openai/src/tools/index.ts`, add `browser_task` to the unified tool array.

**Step 3: Add env var**

Add `CUA_WORKER_URL=https://cua.gallagherpropco.com` to Vercel env vars.

**Step 4: Run typecheck**

```bash
pnpm typecheck
```

**Step 5: Commit**

```bash
git add packages/openai/src/tools/browserTools.ts packages/openai/src/tools/index.ts
git commit -m "feat(tools): add browser_task tool — CUA worker integration"
```

---

### Task 6: Add model toggle to chat UI

**Files:**
- Modify: `apps/web/components/chat/ChatHeader.tsx` (or equivalent chat header component)
- Modify: `apps/web/lib/chat/types.ts` — add `cuaModel` to chat context

**Step 1: Find the chat header component**

Search for the component that renders the top bar of the chat interface. It likely has the conversation title, settings, etc.

**Step 2: Add model selector**

Add a small dropdown or segmented control:
```
[gpt-5.4 ▾]
```

Options: `gpt-5.4` (default) and `gpt-5.4-mini`.

Store the selection in the chat context or user preferences. The value is passed to the `browser_task` tool via the agent's run context.

**Step 3: Persist preference**

Save to `user_preferences` table via existing preference API, or use localStorage for simplicity.

**Step 4: Commit**

```bash
git add apps/web/components/chat/
git commit -m "feat(ui): add CUA model toggle (gpt-5.4 / gpt-5.4-mini) to chat header"
```

---

### Task 7: Add BrowserSessionCard to chat UI

**Files:**
- Create: `apps/web/components/chat/BrowserSessionCard.tsx`
- Modify: `apps/web/components/chat/MessageBubble.tsx` — render card for browser_task results

**Step 1: Create BrowserSessionCard**

A card component that renders inline in the chat message stream:

```
┌─────────────────────────────────────────────┐
│ 🌐 Browser Session — lacdb.com              │
│ ┌─────────────────────────────────────────┐ │
│ │ [live screenshot — updates each turn]   │ │
│ │                                         │ │
│ └─────────────────────────────────────────┘ │
│ Turn 5/24 · gpt-5.4 · 12s elapsed          │
│                                             │
│ Actions:                                    │
│ • Clicked "Advanced Search"                 │
│ • Typed "East Baton Rouge" in location      │
│ • Clicked "Search"                          │
│                                             │
│ [Save to Knowledge Base]  [View Full Size]  │
└─────────────────────────────────────────────┘
```

When the task is in progress, the screenshot updates via SSE. When complete, shows final state + action buttons.

**Step 2: Wire into MessageBubble**

Detect when a tool result is from `browser_task` and render the BrowserSessionCard instead of raw JSON.

**Step 3: Add "Save to Knowledge Base" button**

On click, sends a follow-up message: "Save this browser data to the knowledge base" which triggers the agent to call `store_knowledge_entry()`.

**Step 4: Commit**

```bash
git add apps/web/components/chat/BrowserSessionCard.tsx apps/web/components/chat/MessageBubble.tsx
git commit -m "feat(ui): add BrowserSessionCard with live screenshots and knowledge base save"
```

---

### Task 8: Wire playbook learning (knowledge base integration)

**Files:**
- Modify: `packages/openai/src/tools/browserTools.ts` — add playbook lookup and save
- Modify: `packages/openai/src/agents/entitlement-os.ts` — add browser instructions to prompt

**Step 1: Before calling CUA worker, check for playbook**

In the `browser_task` tool's execute function, before making the HTTP call:

```typescript
// Search knowledge base for site playbook
const playbook = await searchKnowledgeBase(orgId, `browser playbook ${domain}`);
// If found, extract strategy/selectors/code and pass to CUA worker
```

**Step 2: After successful task, save playbook**

```typescript
if (result.success) {
  // Save strategy as knowledge entry
  await storeKnowledgeEntry(orgId, {
    sourceId: `browser:${domain}:${Date.now()}`,
    contentType: "browser_playbook",
    content: `Site: ${domain}\nTask: ${instructions}\nStrategy: ${result.strategyUsed}`,
    metadata: { domain, selectors: result.selectorsUsed },
  });
}
```

**Step 3: Add browser guidance to agent prompt**

In `entitlement-os.ts`, add a section:

```
## Browser Automation
You have a browser_task tool that can navigate external websites.
Use it when the user asks you to look up data on county portals, LACDB, FEMA, etc.
When a browser task fails, show the user the screenshot and ask for guidance.
When it succeeds, offer to save the data to the knowledge base.
Previously successful site strategies are automatically loaded as playbooks.
```

**Step 4: Commit**

```bash
git add packages/openai/src/tools/browserTools.ts packages/openai/src/agents/entitlement-os.ts
git commit -m "feat(cua): wire playbook learning — knowledge base lookup and save"
```

---

### Task 9: Full verification gate

**Step 1: Run tests**

```bash
pnpm typecheck
pnpm vitest run
cd infra/cua-worker && npx tsc --noEmit
```

**Step 2: Build**

```bash
OPENAI_API_KEY=placeholder pnpm build
```

**Step 3: Test CUA worker end-to-end**

```bash
# Test against the live worker on the Windows server
curl -X POST https://cua.gallagherpropco.com/tasks \
  -H "Authorization: Bearer $LOCAL_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://lacdb.com",
    "instructions": "Find property listings for sale in East Baton Rouge Parish, Louisiana. Extract address, price, property type, and size for each listing.",
    "model": "gpt-5.4-mini"
  }'
```

**Step 4: Test in the chat**

Send: "Go to lacdb.com and find commercial properties for sale in Baton Rouge"

Verify:
- Agent calls `browser_task` tool
- BrowserSessionCard appears with live screenshots
- Results are extracted and presented
- "Save to Knowledge Base" button works

**Step 5: Push**

```bash
git push origin main
```

---

## Commit Sequence

1. `feat(cua): scaffold CUA worker project structure`
2. `feat(cua): port Responses API computer_call loop and browser session`
3. `feat(cua): add Fastify HTTP server with task endpoints and SSE streaming`
4. `feat(cua): Docker image and tunnel route for CUA worker`
5. `feat(tools): add browser_task tool — CUA worker integration`
6. `feat(ui): add CUA model toggle to chat header`
7. `feat(ui): add BrowserSessionCard with live screenshots and knowledge base save`
8. `feat(cua): wire playbook learning — knowledge base lookup and save`
9. `verification + deploy`

## Dependencies

- Tasks 1-3 are the CUA worker (can be built independently)
- Task 4 requires SSH access to the Windows server
- Task 5 requires the CUA worker to be running (depends on Task 4)
- Tasks 6-7 are UI only (can be built in parallel with Tasks 1-4)
- Task 8 connects everything together
- Task 9 is end-to-end verification
