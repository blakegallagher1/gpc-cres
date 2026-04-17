# macOS App QA Notes

**Date:** 2026-04-11
**Scope:** `apps/macos`
**Build under test:** `main` after PR #202 merge
**Tester:** Codex

## Test Setup

- Built release app with `swift build -c release` from `apps/macos/`.
- Staged a temporary bundle at `/tmp/GallagherCres.app` for launch-based QA.
- Launched the app with persisted prefs reset and then re-tested with explicit prefs overrides.
- Used the provided operator credentials to complete a production Auth.js credentials flow outside the app and derive a signed `/api/auth/token` JWT for shell-auth testing.

## Verified Working

1. The app launches as a real macOS window once bundled as `.app`.
2. The signed-out recovery surface renders correctly in the native inspector.
3. The command palette opens with `Cmd+K` and dismisses with `Esc`.
4. The menu bar status item opens a quick-jump popover and reports site reachability.
5. Persisted prefs are honored: `selectedRoute` and `inspectorCollapsed` restore across launches.
6. Authenticated production content now renders inside the macOS app from a fresh process.
7. Authenticated route navigation inside the macOS app works at least for `Chat` and `Runs`.

## Confirmed Issues

### 1. Resolved: WebView session establishment

- The macOS app now renders authenticated production content in a fresh app process when bootstrapped with a valid Auth.js session token.
- Verified visually with authenticated `Chat` and `Runs` surfaces inside the actual `Gallagher Cres` app window.
- Evidence:
  - Authenticated chat surface: `docs/reports/assets/2026-04-11-macos-authenticated-chat.png`
  - Authenticated runs surface: `docs/reports/assets/2026-04-11-macos-authenticated-runs.png`

### 2. High: Bearer-token override does not satisfy native health/auth checks cleanly

- Injecting a valid signed JWT through the app’s bearer-token override changes the native inspector state from `Sign in required` to route-specific data mode.
- However, the shell still reports degraded auth health: `API health rejected the configured bearer token` and `Detailed DB health rejected the configured bearer token`.
- This means the app’s native API path is only partially usable even with a valid operator token.
- Evidence:
  - With bearer token applied: `/tmp/gallagher_with_bearer.png`

### 3. Medium: QA/dev run path is missing the expected app-local launcher script

- `apps/macos/script/build_and_run.sh` does not exist, so launch verification still requires manual bundle staging and `open -n /tmp/GallagherCres.app`.
- This is not a product bug, but it slows reliable verification and makes future desktop QA less repeatable.

## Observations, Not Yet Classified As Bugs

- The left sidebar appears visually narrow in window captures, but the persisted split-view prefs report a `288`-point sidebar width. This may be a capture/layout perception issue rather than a true split-view bug.
- The inspector-visibility confusion earlier in the session was mostly explained by persisted prefs restoring `inspectorCollapsed=1`.

## Artifacts

- Clean signed-out window with inspector visible: `/tmp/gallagher_clean_prefs.png`
- Command palette open: `/tmp/gallagher_palette_open.png`
- Command palette dismissed: `/tmp/gallagher_palette_dismissed.png`
- Menu bar popover: `/tmp/gallagher_menubar_popover.png`
- Bearer-token test state: `/tmp/gallagher_with_bearer.png`
- Authenticated chat in app: `docs/reports/assets/2026-04-11-macos-authenticated-chat.png`
- Authenticated runs in app: `docs/reports/assets/2026-04-11-macos-authenticated-runs.png`

## Recommended Fix Order

1. Fix native bearer-token handling so connectivity/health checks accept the same token shape the shell already derives from `/api/auth/token`.
2. Add the missing `apps/macos/script/build_and_run.sh` run entrypoint for repeatable desktop verification.
