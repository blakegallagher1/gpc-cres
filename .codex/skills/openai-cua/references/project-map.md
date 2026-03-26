# Project Map

Use this map to choose the correct file set before editing the CUA stack.

## End-to-End Flow

1. User prompt enters chat through `apps/web/app/api/chat/route.ts`.
2. The agent runtime chooses `browser_task` when the job requires external website navigation.
3. `packages/openai/src/tools/browserTools.ts` calls the CUA worker over HTTP.
4. `infra/cua-worker/src/server.ts` validates the request and launches a browser session.
5. `infra/cua-worker/src/responses-loop.ts` runs the OpenAI Responses API `computer` loop.
6. `infra/cua-worker/src/browser-session.ts` executes actions through Playwright and captures screenshots.
7. The worker returns structured results and screenshot paths.
8. Chat UI renders the session via `apps/web/components/chat/MessageBubble.tsx`.

## File Ownership

### Worker

- `infra/cua-worker/src/server.ts`
  Own request validation, task lifecycle, execution mode selection, and SSE publication.
- `infra/cua-worker/src/responses-loop.ts`
  Own the OpenAI `computer` request shape, `computer_call` handling, action execution order, screenshot return path, and loop chaining with `previous_response_id`.
- `infra/cua-worker/src/browser-session.ts`
  Own Playwright browser launch, page lifecycle, and screenshot artifact capture.
- `infra/cua-worker/src/types.ts`
  Own task, event, and computer-action shapes shared inside the worker.

### Product Tooling

- `packages/openai/src/tools/browserTools.ts`
  Own worker URL selection, auth headers, preferred-model routing, timeouts, polling, and product-facing result payloads.
- `packages/openai/src/tools/browserTools.test.ts`
  Cover model routing and tool payload behavior.
- `packages/openai/src/tools/index.ts`
  Export the tool for the rest of the app.

### Agent Prompting And Policy

- `packages/openai/src/agents/entitlement-os.ts`
  Tell the agent when to use `browser_task`, how to search for playbooks first, and how to handle success or failure.
- `packages/openai/src/agentos/toolPolicy.ts`
  Keep `browser_task` present in the allowed-tool policy when the product should expose it.

### Chat And UI

- `apps/web/app/api/chat/route.ts`
  Carry `cuaModel` and other chat request data into the agent execution path.
- `apps/web/components/chat/CuaModelToggle.tsx`
  Own the user preference UI and local storage key for `gpt-5.4` vs `gpt-5.4-mini`.
- `apps/web/components/chat/ChatContainer.tsx`
  Thread the selected model through chat requests.
- `apps/web/components/chat/MessageBubble.tsx`
  Render special browser-session cards for `browser_task` results.

## Testing Targets

- Worker compile check:
  `pnpm -C infra/cua-worker run typecheck`
- Tool contract test:
  `pnpm --filter @entitlement-os/openai exec vitest run src/tools/browserTools.test.ts`
- Chat route test:
  `pnpm -C apps/web exec vitest run --configLoader runner app/api/chat/route.test.ts`

## Common Edit Bundles

- OpenAI contract change:
  `infra/cua-worker/src/responses-loop.ts`
  `infra/cua-worker/src/types.ts`
- Tool payload change:
  `packages/openai/src/tools/browserTools.ts`
  `packages/openai/src/tools/browserTools.test.ts`
- User model preference change:
  `packages/openai/src/tools/browserTools.ts`
  `apps/web/app/api/chat/route.ts`
  `apps/web/components/chat/CuaModelToggle.tsx`
- UI rendering change:
  `apps/web/components/chat/MessageBubble.tsx`
  related tests or snapshots

## Scope Reminders

- Use this skill for the project CUA stack, not generic Playwright test authoring.
- Use the Playwright skill for browser automation tests that do not change the OpenAI CUA integration.
- Use the server-ops skill for production health, tunnels, container restarts, or deployment operations.
