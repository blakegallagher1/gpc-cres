# Copilot Commands Library

_Last updated: 2026-02-15_

This library maps practical commands to tested copilot workflows.

## Command types

### 1) Deal analytics
- **Prompt**: `Run a full underwriting summary with NOI, DSCR, IRR, debt sizing, and key risks.`
- **Agent**: finance
- **Use for**: early underwriting pass, scenario framing, underwriting refresh requests.
- **Output pattern**: financial summary, assumptions, and sensitivity notes.

### 2) LOI drafting
- **Prompt**: `Draft a concise LOI with price, diligence timeline, closing terms, and contingencies.`
- **Agent**: legal
- **Use for**: investor or owner outreach prep, term sheet kickoff.
- **Output pattern**: pricing structure, diligence scope, conditions precedent.

### 3) Comparable market review
- **Prompt**: `Summarize the top comps with pricing, cap rates, and supporting rationale.`
- **Agent**: research
- **Use for**: market check, pricing confidence checks, IC prep.
- **Output pattern**: comp list, comparability rationale, market spread context.

### 4) DD checklist creation
- **Prompt**: `Create a due diligence checklist with owners, SLAs, and dependencies.`
- **Agent**: operations
- **Use for**: building task sequencing and dependency control.
- **Output pattern**: ordered workstreams, owners, due dates, blockers.

## Suggested workflow patterns

- Save strong prompts: after entering a good prompt, run `Cmd/Ctrl + S` while focused.
- Reuse last successful prompt: press `Cmd/Ctrl + ↑`.
- Execute quickly: press `Cmd/Ctrl + Enter` inside the Copilot input.

## Recommended saved commands

1. `Generate a preliminary underwriting scorecard for the selected deal.`
2. `Draft an opening LOI and identify 5 diligence questions.`
3. `Build a 3-item comparable set for industrial land in Baton Rouge and flag outliers.`
4. `Create a diligence checklist for environmental, title, and flood-related risks.`

## Operational expectations

- Commands are text prompts. The better your input constraints (jurisdiction, timeframe, assumptions), the better the output quality.
- Commands should be clear about outputs: add requested format in the prompt when needed (e.g., bullet list, table, action plan).
- If a command consistently underperforms, save a variant and treat it as the canonical command for your team.
