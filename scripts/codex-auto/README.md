# Codex Automation Scripts

Autonomous development automation for gallagher-cres using `codex exec`. No ChatGPT required — these run entirely via the Codex CLI.

## Quick Start

```bash
# Make scripts executable (one time)
chmod +x scripts/codex-auto/*.sh

# Run any one-off prompt
./scripts/codex-auto/run.sh "add input validation to the deals API"

# Quality sweep (type-hardening + auth audit + lint fixes)
./scripts/codex-auto/sweep.sh

# Implement the next Planned ROADMAP item
./scripts/codex-auto/roadmap-next.sh

# Fix a failed CI run
./scripts/codex-auto/ci-fix.sh latest
./scripts/codex-auto/ci-fix.sh 12345678

# Review an open PR
./scripts/codex-auto/review-pr.sh 42

# Run all nightly tasks
./scripts/codex-auto/nightly.sh
```

## Scripts

| Script | Purpose | When to Use |
|--------|---------|-------------|
| `run.sh` | Run any prompt against the repo | Ad-hoc tasks, quick fixes |
| `sweep.sh` | Type-hardening, auth audit, lint fix | Weekly quality maintenance |
| `roadmap-next.sh` | Implement next ROADMAP item | Continuous delivery |
| `ci-fix.sh` | Auto-fix failed CI runs | After CI failure notification |
| `review-pr.sh` | AI code review on a PR | Before merging |
| `nightly.sh` | Orchestrates sweep + ci-fix + roadmap | Scheduled via cron/launchd |

## Sweep Modes

```bash
./scripts/codex-auto/sweep.sh all     # Everything (default)
./scripts/codex-auto/sweep.sh types   # Only type-hardening
./scripts/codex-auto/sweep.sh auth    # Only auth pattern audit
./scripts/codex-auto/sweep.sh lint    # Only lint + typecheck fixes
```

## Scheduling

### macOS (launchd) — Recommended

```bash
# Install the nightly schedule (runs at 2 AM)
cp scripts/codex-auto/com.gallagher.codex-nightly.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.gallagher.codex-nightly.plist

# Check status
launchctl list | grep codex

# Uninstall
launchctl unload ~/Library/LaunchAgents/com.gallagher.codex-nightly.plist
rm ~/Library/LaunchAgents/com.gallagher.codex-nightly.plist
```

### Cron

```bash
# Add to crontab (crontab -e)
0 2 * * * /Users/gallagherpropertycompany/Documents/gallagher-cres/scripts/codex-auto/nightly.sh >> /tmp/codex-nightly.log 2>&1
```

## How It Works

All scripts use `codex exec` — Codex's non-interactive mode. This:
- Reads your project's `.codex/config.toml`, `AGENTS.md`, skills, and rules
- Runs the AI agent against your codebase
- Executes shell commands (lint, test, build, git) autonomously
- Creates branches, commits, and PRs when work is done

No ChatGPT, no browser, no human in the loop required.

## Logs

All runs are logged to `scripts/codex-auto/logs/` with timestamps. Check these if something goes wrong.

## Prerequisites

- `codex` CLI installed and authenticated (`codex login`)
- `gh` CLI installed and authenticated (`gh auth login`)
- Node.js and pnpm available
- Git configured with push access to the repo
