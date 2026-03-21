# Codex CLI Compatibility Audit — Entitlement OS

**Date:** 2026-03-20
**Audited against:** OpenAI Codex CLI (Rust implementation, main branch as of 2026-03-20)

---

## Verdict: PASS with 7 issues to address

Your `.codex/` setup is mature and well-structured. The config, agents, skills, rules, and environment files are all present and correctly formatted. Below are the issues found, ranked by severity.

---

## CRITICAL ISSUES (2)

### 1. `.codex/` is gitignored — config won't persist or share

**File:** `.gitignore` line 75
```
.codex/
```

Your entire `.codex/` directory (config.toml, 6 agent TOMLs, 8 skills, toolchain rules, environment setup) is excluded from version control. `git ls-files .codex/` returns nothing. This means:

- Your config is local-only and will be lost if the machine is rebuilt
- No other team member or CI runner can use the Codex setup
- The `.codex-learnings.md` ignore on line 76 is redundant (already covered by `.codex/`)

**Fix:** Replace the blanket `.codex/` ignore with selective ignores:

```gitignore
# Codex — ignore session state and learnings, but track config
.codex-learnings.md
.codex/sandbox/
.codex/state/
.codex/cache/
# Keep: config.toml, agents/, skills/, rules/, environments/
```

Then force-add the config files:
```bash
git add -f .codex/config.toml .codex/agents/ .codex/skills/ .codex/rules/ .codex/environments/
```

### 2. Deprecated/non-existent config keys — Rust CLI will warn or ignore

Your config.toml uses several keys that exist in the Python SDK's extended schema but are **not recognized** by the current open-source Rust Codex CLI:

| Key | Status | Fix |
|-----|--------|-----|
| `review_model` | Not in Rust CLI schema | Remove or move to a comment; use profiles instead |
| `suppress_unstable_features_warning` | Not in Rust CLI | Remove — Rust CLI doesn't have this warning |
| `project_doc_max_bytes` | Not in Rust CLI | Remove; context is managed differently |
| `model_auto_compact_token_limit` | Not in Rust CLI | Remove |
| `tool_output_token_limit` | Not in Rust CLI | Remove |
| `[sandbox_workspace_write]` section | Not in Rust CLI | Remove; network access is controlled by sandbox_mode |
| `features.child_agents_md` | Deprecated | Remove — `false` is already the default |
| `features.prevent_idle_sleep` | Not in Rust CLI | Remove |
| `features.fast_mode` | Not in Rust CLI | Remove |
| `features.enable_request_compression` | Not in Rust CLI | Remove |
| `features.js_repl` | Not in Rust CLI | Remove |
| `js_repl_node_module_dirs` | Not in Rust CLI | Remove |
| `[tui]` section | Partially supported | `notifications` and `status_line` may work; `animations`, `show_tooltips`, `notification_method` are not documented |
| `[memories]` subsection keys | Not in Rust CLI | Remove granular tuning; memories are on/off |
| `profiles.*.model_reasoning_summary` | Check if supported | May need to be just `model_reasoning_effort` |

**Note:** If you're running a private/enterprise Codex build (the Python SDK `codex exec` path), these keys may be valid in that context. The open-source Rust CLI has a narrower schema. Verify which binary you're actually invoking.

---

## MODERATE ISSUES (3)

### 3. `web-agent.toml` missing `sandbox_mode`

**File:** `.codex/agents/web-agent.toml`

The web-agent and agent-agent TOMLs don't specify `sandbox_mode`. They inherit from the root config (`danger-full-access`), which is probably fine, but it's better to be explicit since these agents write files:

```toml
sandbox_mode = "workspace-write"
```

### 4. Stale Supabase references in shell environment policy

**File:** `.codex/config.toml` lines 55-57

```toml
"SUPABASE_URL",
"SUPABASE_ANON_KEY",
"SUPABASE_SERVICE_ROLE_KEY",
```

Per CLAUDE.md: "Both Supabase projects archived (2026-03-04)." These env vars are dead weight in the shell policy. They won't cause errors but add confusion.

**Fix:** Remove the three Supabase entries from `include_only`.

### 5. `web-agent.toml` references Supabase auth pattern

**File:** `.codex/agents/web-agent.toml` line 14

```
Every API route: authenticate Supabase session → confirm org membership → scope by orgId
```

With Supabase archived, this instruction is stale. It should reference NextAuth:

```
Every API route: authenticate NextAuth session → confirm org membership → scope by orgId
```

---

## MINOR ISSUES (2)

### 6. No MCP servers configured

The Rust CLI supports `[mcp_servers]` configuration for connecting to external tool servers (databases, APIs, etc.). Your FastAPI gateway and Sentry integration could benefit from MCP server definitions instead of relying solely on shell scripts in skills. This is optional but worth considering as the Codex MCP ecosystem matures.

### 7. `rules/toolchain.rules` allows `pkill -f` and `kill`

**File:** `.codex/rules/toolchain.rules` lines 71-73

```
prefix_rule(pattern=["kill"], decision="allow")
prefix_rule(pattern=["pkill", "-f"], decision="allow")
```

These are broad process-killing permissions. With `danger-full-access` sandbox mode, this is redundant (everything is already allowed). If you ever switch to `workspace-write` mode, these could be dangerous. Consider scoping or removing.

---

## THINGS THAT ARE CORRECT

Your setup gets these right, which many projects miss:

- **AGENTS.md hierarchy** — Root-level AGENTS.md is well-structured with architecture map, dependency rules, code conventions, and testing requirements. Codex merges this with `~/.codex/AGENTS.md` and directory-specific ones.
- **Agent role separation** — 6 specialized agents with appropriate sandbox modes (explorer=read-only, reviewer=read-only, db-agent=workspace-write, shipper=full-access).
- **Skills with YAML frontmatter** — Sentry, Playwright, auth-pattern skills all follow the correct `---name/description/triggers---` format.
- **Toolchain rules** — Comprehensive allowlist for pnpm, git, gh, docker, vercel, prisma commands.
- **Environment setup script** — Handles gh CLI installation, pnpm bootstrap, and quick actions (Dev/Build/Test/Lint).
- **Profiles** — Feature, bugfix, migrate, spark, and review profiles cover the full workflow spectrum.
- **Shell environment policy** — 29 carefully scoped env vars with `ignore_default_excludes = true` for API keys.
- **Memory and history** — Both enabled with sensible defaults.

---

## RECOMMENDED CONFIG.TOML (cleaned for Rust CLI compatibility)

If you want a version that's clean for the open-source Rust Codex CLI, the changes are:

1. Remove unrecognized keys (review_model, suppress_unstable_features_warning, project_doc_max_bytes, model_auto_compact_token_limit, tool_output_token_limit, sandbox_workspace_write section, js_repl_node_module_dirs)
2. Remove deprecated feature flags (child_agents_md, prevent_idle_sleep, fast_mode, enable_request_compression, js_repl)
3. Remove stale Supabase env vars
4. Simplify [memories] to just the features toggle
5. Keep everything else as-is

If you're running a private/enterprise Codex build that supports the extended schema, your current config is fine — just fix the gitignore and stale Supabase references.
