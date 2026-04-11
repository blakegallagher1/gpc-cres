# Gallagher Cres macOS

Native SwiftUI macOS shell for the full Entitlement OS website.

## What it includes

- Native sidebar-detail operator shell
- Embedded `WKWebView` session that loads the real production website
- Toolbar and Command menu browser controls
- Settings window for base URL, launch path, and optional advanced token storage
- Unified logging categories for navigation, API, refresh, settings, and windowing
- Sidebar favorites for major production routes plus a freeform path field for any route

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

- Default base URL is `https://gallagherpropco.com`.
- Sign in through the in-app website session to access the same feature set as the browser.
- Build artifacts are kept local under `apps/macos/.build` and `apps/macos/dist`.
