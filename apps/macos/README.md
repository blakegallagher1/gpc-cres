# Gallagher Cres macOS

Native SwiftUI desktop client for Entitlement OS.

## What it includes

- Native sidebar-detail operator shell
- Toolbar and Command menu refresh actions
- Settings window for base URL and optional bearer token
- Unified logging categories for navigation, API, refresh, settings, and windowing
- Native views for overview, deals, runs, map workspace status, automation watch, and memory systems
- HTTP bridge to existing Entitlement OS routes under `apps/web/app/api`

## Run

From repo root:

```bash
./script/build_and_run.sh
```

Optional modes:

```bash
./script/build_and_run.sh --debug
./script/build_and_run.sh --logs
./script/build_and_run.sh --telemetry
./script/build_and_run.sh --verify
```

The Codex desktop Run action is wired through:

`/Users/gallagherpropertycompany/Documents/gallagher-cres/.codex/environments/environment.toml`

## Notes

- Default base URL is `http://localhost:3000`.
- If the selected Entitlement OS environment requires auth, provide a bearer token in Settings.
- Build artifacts are kept local under `apps/macos/.build` and `apps/macos/dist`.
