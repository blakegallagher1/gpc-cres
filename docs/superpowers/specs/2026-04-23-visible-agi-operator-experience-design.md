# Visible AGI Operator Experience Design

Status: Draft for user review  
Date: 2026-04-23  
Scope: `/chat`, run visibility, shared working context, and command-center launch paths

## Problem

The codebase already contains the ingredients for an agentic operating system: chat streaming, tool approvals, evidence/trust envelopes, run state, memory, command center signals, map workspaces, deal context hydration, and a hidden admin Codex-style control surface.

The product does not yet make that intelligence feel unified to the operator. The most AGI-like capabilities are split across `/chat`, `/runs`, `/agents`, `/map`, `/command-center`, and `/admin/codex`. The first upgrade should therefore be a visibly smarter operator experience, not a deeper autonomous backend rewrite.

## Goals

- Make `/chat` feel like a live mission-control desk, not a generic assistant thread.
- Show what the system is doing: active context, plan, tool activity, approvals, evidence, memory, run state, and next actions.
- Make selected deals, parcels, alerts, conversations, and runs portable as a working context.
- Let the command center launch structured missions into the chat/run desk.
- Test each phase before moving to the next.

## Non-Goals

- Do not replace the existing agent runtime.
- Do not move `/admin/codex` into the public operator surface wholesale.
- Do not change auth, org scoping, gateway access, or the Postgres/Qdrant authority model.
- Do not introduce broad schema migrations unless the implementation phase proves local or existing persistence is insufficient.

## Current Anchors

- Main chat surface: `apps/web/components/chat/ChatContainer.tsx`
- Chat workspace panels: `apps/web/components/chat/ChatWorkspacePanels.tsx`
- Conversation history: `apps/web/components/chat/ConversationSidebar.tsx`
- Agent execution and trust: `apps/web/lib/agent/executeAgent.ts`
- Server chat workflow: `packages/server/src/chat/run-agent-workflow.service.ts`
- Tool execution: `apps/web/lib/agent/toolRegistry.ts`
- Run intelligence: `apps/web/components/runs/RunIntelligenceTab.tsx`
- Command center: `apps/web/components/command-center/CommandCenterWorkspace.tsx`
- Map workspace/context pattern: `apps/web/lib/chat/MapChatContext.tsx`, `apps/web/components/maps/MapOperatorConsole.tsx`
- Admin Codex interaction model: `apps/web/app/admin/codex/page.tsx`

## Phase 1: Mission-Control Chat Desk

### User Experience

Turn `/chat` into the visible intelligence hub. A run should present as a mission with structured operational state:

- Mission header: run status, selected mode, active deal/parcel/context, transport, and last checkpoint.
- Context pack: deal, map selection, command-center source item, memory hints, and uploaded files.
- Live plan: current goal, steps pending, steps complete, and blocked steps.
- Tool timeline: tool starts, results, failures, retries, and approval pauses.
- Evidence rail: trust envelope, citations, proof checks, missing evidence, and confidence.
- Memory rail: facts used, facts written, conflicts, and verified/draft state.
- Next actions: suggested follow-up missions, workflow starts, map/deal handoffs, and unresolved evidence requests.

### Implementation Shape

- Extend existing chat workspace components rather than replacing them.
- Reuse `AgentTrustEnvelope` and streamed `agent_progress`, `tool_start`, `tool_end`, `tool_approval_requested`, `agent_summary`, and `done` events.
- Borrow interaction ideas from `/admin/codex`: live plan checklist, approval-first affordances, command/tool output blocks, and connection state.
- Keep the existing `ConversationSidebar` visible and usable because historical continuity is central to perceived intelligence.
- Keep REST/SSE as the safe default while surfacing transport status honestly. WebSocket re-enable is a separate runtime task.

### Acceptance Criteria

- A user can open `/chat` and understand the mission state without reading raw assistant text.
- Tool approvals remain visible and actionable while the mission plan/evidence rails update.
- Restored conversations reopen with their latest trust, context, and run summary.
- Mobile retains access to history, verification/evidence, and active approvals.

### Test Gate Before Phase 2

- Component tests for new mission desk sections.
- Existing chat tests still pass.
- Focused E2E for `/chat`: start message, observe mission state, see tool/evidence placeholders, history still reachable, mobile controls still reachable.
- Typecheck and lint must pass for touched files.

## Phase 2: Working Context Spine

### User Experience

Create a shared context object that makes the system feel aware across surfaces:

- From map: selected parcel set, viewport, workspace, owner cluster, comps, overlays.
- From deals: deal, stage, fit score, contingencies, documents, comments, workflows.
- From command center: briefing item, deadline, portfolio alert, opportunity match.
- From runs: prior run, confidence, evidence, tool sequence, unresolved gaps.
- From memory: verified facts, recent relevant conclusions, conflicts, source reliability.

The operator should see context chips in `/chat`, remove stale context, and understand what the agent will use before a run begins.

### Implementation Shape

- Define a lightweight `OperatorContextEnvelope` in the web layer first.
- Build adapters from existing data instead of introducing a new database table immediately.
- Use URL params, local client state, conversation metadata, and existing persisted objects where available.
- Route handoffs into `/chat` with explicit context payloads.
- Keep context visible and editable; avoid invisible prompt stuffing.

### Acceptance Criteria

- Map, deal, run, and command-center surfaces can hand off a context pack to `/chat`.
- Chat visibly lists attached context before and during a mission.
- Context can be removed or replaced before sending.
- The context pack is included in the agent request in a typed, testable path.

### Test Gate Before Phase 3

- Unit tests for context envelope normalization.
- Component tests for context chips/rail.
- E2E handoff from at least one source surface into `/chat`.
- Existing chat, map, and command-center tests still pass.
- Typecheck and lint must pass for touched files.

## Phase 3: Command-Center Mission Launcher

### User Experience

Make `/command-center` the proactive launcher into the mission-control desk.

Every important signal should offer a clear action:

- "Investigate this deadline risk"
- "Screen this opportunity"
- "Explain this portfolio drift"
- "Prepare next-step plan"
- "Open evidence-backed deal brief"

The command center should not just summarize. It should create executable missions with the right context already attached.

### Implementation Shape

- Add mission launcher actions to command-center sections.
- Generate structured prompts from typed source items, not freeform string concatenation.
- Navigate to `/chat` with an attached `OperatorContextEnvelope`.
- Prefer one shared mission-launch helper so command center, map, deals, and runs converge on the same pattern.
- Keep launch actions additive; do not block current command-center read-only behavior.

### Acceptance Criteria

- Priority queue, deadlines, opportunities, and operating brief items can launch missions.
- Launched missions arrive in `/chat` with clear context and editable prompt text.
- The user can start, modify, or cancel the mission before execution.
- Each launched mission preserves source provenance in the context rail.

### Test Gate Before Completion

- Component tests for launcher controls.
- Unit tests for prompt/context builders.
- E2E from `/command-center` to `/chat` with context preserved.
- Regression tests for command-center data rendering.
- Full closeout: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`.

## Rollout Order

1. Phase 1: Mission-control chat desk.
2. Run Phase 1 tests and fix before touching Phase 2.
3. Phase 2: working context spine.
4. Run Phase 2 tests and fix before touching Phase 3.
5. Phase 3: command-center mission launcher.
6. Run final repo gates and ship.

## Open Decisions

- Whether Phase 1 should include a visual run-plan timeline or a compact checklist first.
- Whether context handoff should use query/session storage for V1 or create a minimal server-side draft context endpoint.
- Whether `/agents` and `/runs` should be visually upgraded during this sequence or left for a follow-up after `/chat` absorbs their most important operator signals.

## Recommendation

Proceed with all three phases in sequence, but enforce the test gates. This makes the product visibly smarter without destabilizing the agent runtime. The main implementation risk is over-expanding Phase 1; the safe cut is to make `/chat` show mission state first, then let context and proactive launchers build on that foundation.
