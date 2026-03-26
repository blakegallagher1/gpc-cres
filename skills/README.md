# Skills Architecture

`skills/` contains versioned instruction bundles loaded on demand by agents
working in this repository (Codex, Claude Code, Cursor).

A skill is not a global prompt replacement. It is a targeted procedure module
for one domain lane. Skills are invoked only when routing selects them.

## Why Skills

- Keep base agent context small and stable.
- Load only the domain procedure needed for the current request.
- Make routing explicit and testable.
- Keep lane-specific logic versioned and maintainable.

## SKILL.md Format Spec

Every skill file must follow this exact shape:

```markdown
***
name: <kebab-case-skill-name>
version: "1.0"
description: |
  Use when: <routing criteria>
  Don't use when: <negative routing criteria>
  Outputs: <artifacts or result contract>
***

## Prerequisites
...

## Steps
1. ...

## Validation
...

## Examples
### Good input -> expected output
...

### Bad input -> expected routing
...
```

## Invocation Modes

- Deterministic: caller names a skill directly (for example, "use underwriting").
- Auto-routed: model chooses a skill by matching request intent to `description`.
- Entitlement sub-skill: `entitlement-os` loads one phase file from
  `skills/entitlement-os/phases/` for phase-specific work.

## Token Cost Impact

Without skills, long prompt docs are loaded repeatedly. In this repository that
means `AGENTS.md` (~24 KB) plus entitlement prompt docs (~33 KB) are often
reintroduced in full during long workflows.

With skills, only the matched lane is loaded. Unused skills cost zero tokens.
This reduces repeated context load and lowers long-horizon token pressure.

## Skill Tree

- `skills/underwriting/SKILL.md`
- `skills/entitlement-os/SKILL.md`
- `skills/entitlement-os/phases/phase-a-discovery.md`
- `skills/entitlement-os/phases/phase-b-zoning-analysis.md`
- `skills/entitlement-os/phases/phase-c-financial-modeling.md`
- `skills/entitlement-os/phases/phase-d-risk-assessment.md`
- `skills/entitlement-os/phases/phase-e-offer-generation.md`
- `skills/entitlement-os/phases/phase-f-due-diligence.md`
- `skills/entitlement-os/phases/phase-g-closing.md`
- `skills/market-trajectory/SKILL.md`
- `skills/architecture-audit/SKILL.md` (v2.0 — corrected layer model 2026-03-26)
- `skills/property-report/SKILL.md`
- `skills/data-extraction/SKILL.md`
- `skills/parcel-ops/SKILL.md`
- `skills/server-ops/SKILL.md`

## Reference

- OpenAI long-running agent production pattern:
  https://openai.com/index/new-tools-for-building-agents/
