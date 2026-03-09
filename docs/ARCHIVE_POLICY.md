# Documentation Archive Policy

Status: Authoritative
Authority: Rules for archival docs and deprecation handling
Owner: Platform engineering
Last reviewed: 2026-03-09

This policy prevents old docs from being mistaken for active requirements.

## When to Archive

Archive a document when any of these are true:

- The architecture/process described is no longer active.
- The file is a historical snapshot (status report, migration phase log, continuation packet).
- A newer canonical file supersedes it.

## Required Archive Banner

Archived docs must include, near the top:

- `Status: Archived snapshot (non-authoritative).`
- A line pointing to the current canonical source (for example `ROADMAP.md`, `docs/SPEC.md`, or runbooks).

## File Handling Rules

- Keep archived docs in place when audit continuity matters.
- Do not list archived docs in primary onboarding paths except under explicit historical sections.
- Never start implementation work from an archived doc.
- If an archived doc still contains unchecked tasks, treat those tasks as historical unless copied into `ROADMAP.md`.

## Deprecation Workflow

1. Mark old doc as archived with banner.
2. Add pointer to replacement canonical doc.
3. Update `docs/INDEX.md` and `docs/SOURCE_OF_TRUTH.md` if needed.
4. Record change in `docs/CHANGELOG_DOCS.md`.
