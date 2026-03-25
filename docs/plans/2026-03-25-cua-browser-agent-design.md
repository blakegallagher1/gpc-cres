# CUA Browser Agent Integration Design

**Date:** 2026-03-25
**Status:** Approved

## Problem

EntitlementOS agents can query our property database and run screening tools, but they can't navigate external websites — county assessor portals, LACDB, FEMA maps, parish clerk sites. Users currently alt-tab to a browser, manually look up data, and paste it back into the chat.

## Solution

Add a CUA (Computer Use Agent) worker to the Windows server that gives the EntitlementOS agent browser automation capabilities via GPT-5.4 native computer use. The agent calls a `browser_task` tool, the CUA worker launches a browser, navigates the site autonomously, and returns structured data + screenshots. Users can choose between gpt-5.4 (95% accuracy, ~$0.30/task) and gpt-5.4-mini (~$0.05/task) via a toggle in the chat header.

## Architecture

```
Chat UI (model toggle: 5.4 | 5.4-mini)
    ↓
EntitlementOS Agent (gpt-5.4)
    ↓ calls browser_task tool
    ↓ passes site playbook from knowledge base (if exists)
    ↓
HTTP POST → cua.gallagherpropco.com/tasks
    ↓ (Cloudflare Tunnel → Docker on Windows server)
    ↓
CUA Worker Container
    ├─ Has proven code playbook? → Code mode (Playwright, instant, free)
    └─ No playbook? → Native mode (GPT-5.4 Responses API + computer_call)
        ├─ Launch Playwright + Chromium
        ├─ Screenshot → model → actions → execute → screenshot → repeat
        ├─ Stream events via SSE (screenshots, actions)
        └─ Return: { success, data, screenshots, turns, cost }
    ↓
Agent receives results → presents in chat
    ↓
User: "Save to knowledge base" → store_knowledge_entry + ingest_comps
```

## Graduating Trust Model

1. **First visit** — Native mode, GPT-5.4 computer use. ~$0.30, 30-60s, 95% success.
2. **With strategy** — Native mode with playbook hints. Faster, fewer turns.
3. **With code playbook** — Code mode, Playwright deterministic. ~$0.02, 2-5s.

## Conversational Iteration (Failure Recovery)

When a task fails, the agent shows the user the last screenshot and asks for guidance. The user provides feedback ("click the Advanced Search tab first"), the agent updates the site playbook in the knowledge base, and retries. Successful strategies are saved as procedural skills for future use.

## Knowledge Base Integration

Browser results can be saved to the knowledge base via:
- `store_knowledge_entry()` — full dataset as searchable knowledge
- `ingest_comps()` — individual listings as market comps
- `store_property_finding()` — property-level intelligence in Qdrant

## Components

| Component | Type | Description |
|-----------|------|-------------|
| CUA Worker Container | New Docker container | Playwright + Chromium + Responses API loop |
| Cloudflare tunnel route | Config change | `cua.gallagherpropco.com → cua-worker:3001` |
| `browser_task` tool | New agent tool | Calls CUA worker, streams progress, returns data |
| BrowserSessionCard | New UI component | Live screenshot display during execution |
| Model toggle | New UI component | gpt-5.4 / gpt-5.4-mini selector in chat header |
| Playbook learning | Existing infra | Knowledge base + procedural skills (already built) |

## Key Decisions

- **CUA native mode is primary** — GPT-5.4 achieves 95% on property portals first try
- **Responses API loop from CUA sample app** — canonical reference implementation, no custom loop
- **Playwright is the browser engine** (underneath CUA), not a competing approach
- **No new database tables** — existing knowledge/skills/episodes tables handle everything
- **Single agent architecture preserved** — browser is a tool, not a separate agent

## Cost Model

| Mode | Model | Cost | Time | When |
|------|-------|------|------|------|
| Native (first visit) | gpt-5.4 | ~$0.30 | 30-60s | Unknown sites |
| Native (with hints) | gpt-5.4 | ~$0.15 | 15-30s | Known strategy |
| Native (budget) | gpt-5.4-mini | ~$0.05 | 20-45s | User picks mini |
| Code (graduated) | none | ~$0.00 | 2-5s | Proven playbooks |
