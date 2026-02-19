# Chat Runtime: Behavior and API Contracts

Last reviewed: 2026-02-19


Last updated: 2026-02-16

This document defines runtime contracts for chat execution in `apps/web`, including SSE events, approval flow, resume flow, checkpoint persistence, and failure/retry behavior.

## 1) Primary endpoints

- `POST /api/chat`
  - Starts or continues a chat run.
  - Returns SSE stream.
- `POST /api/chat/tool-approval`
  - Applies a human decision to a pending tool call.
  - Request body: `{ runId, toolCallId, action: "approve" | "reject" }`.
  - Returns `{ ok, events }`.
- `POST /api/chat/resume`
  - Resumes a run from persisted serialized state.
  - Request body: `{ runId }`.
  - Returns `{ ok, runId, status, events }`.

All endpoints are org-scoped and require authenticated session context.

## 2) SSE event types (`/api/chat`)

Current stream events include:

- `text_delta`
  - Incremental assistant text content.
- `agent_switch`
  - Active agent changed.
  - Payload includes `agentName`.
- `handoff`
  - Agent handoff between specialists.
  - Payload includes `from`, `to`.
- `tool_approval_requested`
  - Human approval needed for a tool call.
  - Payload includes `name`, optional `args`, `toolCallId`, `runId`.
- `tool_start`
  - Tool invocation started.
  - Payload includes `name`, optional `args`, optional `toolCallId`.
- `tool_end`
  - Tool invocation completed or failed.
  - Payload includes `name`, optional `result`, optional `status`, optional `toolCallId`.
- `agent_progress`
  - Ongoing run-state update.
  - Payload includes `runId`, `status`, `partialOutput`, optional `toolsInvoked`, optional `runState`, optional `correlationId`.
- `agent_summary`
  - Final trust/evidence summary.
  - Payload includes `runId`, `trust`.
- `done`
  - Terminal stream event.
  - Payload includes `runId`, `status` (`succeeded` | `failed` | `canceled`), optional `conversationId`.
- `error`
  - Runtime or guardrail failure.

## 3) Tool approval flow

1. Run emits `tool_approval_requested`.
2. Client calls `POST /api/chat/tool-approval` with `runId`, `toolCallId`, and `action`.
3. Server reloads pending approval context from run output.
4. Server resumes run using persisted run-state + decision.
5. Response includes emitted events from resumed execution.

Notes:

- Approval audit entries are appended to run output JSON.
- Missing approval state returns server error with message.

## 4) Resume flow

1. Client calls `POST /api/chat/resume` with `runId`.
2. Server loads run by `runId` and org scope.
3. Serialized checkpoint is read from:
   - `runs.serialized_state` (primary)
   - pending approval payload fallback in `output_json` (legacy fallback path)
4. Server resumes execution via `resumeSerializedAgentRun(...)`.
5. Response includes resumed status and emitted events.

## 5) Checkpoint persistence semantics

Checkpoint state is persisted in `runs.serialized_state` as a serialized checkpoint envelope containing:

- schema version (`version: 1`)
- `serializedRunState` (SDK state string)
- checkpoint metadata:
  - `kind` (`tool_completion` | `approval_pending` | `resume_request` | `final_result`)
  - timestamp
  - run/correlation context
  - optional tool metadata
  - optional partial output note

When checkpoints are written:

- Tool completion boundaries (when SDK state is available in stream events).
- Pending approval boundary.
- Resume request boundary.
- Final result boundary.

## 6) Failure and retry expectations

- OpenAI/API transient failures:
  - handled via retry/backoff utilities in `packages/openai`.
- Guardrail-triggered content:
  - surfaced as structured `error` event payloads in chat route.
- Duplicate execution protection:
  - run lease + idempotent run persistence logic in agent runner/execution paths.
- Resume failure modes:
  - if no serialized checkpoint exists, resume returns an explicit error.
- Finalization behavior:
  - stream always attempts to emit a terminal `done` event.

## 7) Related implementation files

- `apps/web/app/api/chat/route.ts`
- `apps/web/app/api/chat/tool-approval/route.ts`
- `apps/web/app/api/chat/resume/route.ts`
- `apps/web/lib/agent/executeAgent.ts`
- `apps/web/lib/agent/agentRunner.ts`
- `apps/web/lib/chat/session.ts`
- `packages/openai/src/utils/runStateSerde.ts`
- `packages/db/prisma/schema.prisma`

Companion docs:

- `docs/SPEC.md` (architecture + security model)
- `docs/PLAN.md` (delivery plan context)
