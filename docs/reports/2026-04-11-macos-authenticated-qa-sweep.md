# macOS Authenticated QA Sweep

**Date:** 2026-04-11
**Scope:** Fixed authenticated macOS build in `apps/macos`
**Method:** Fresh local app bundle launch, authenticated production session, window-ID screenshots

## Result

The macOS app is now authenticated and usable against production, but the authenticated desktop sweep found two remaining navigation/product gaps:

1. `Deals` is only partially wired: the native inspector switches to `Deal Workspace`, but the embedded web surface still appears to remain on the chat experience.
2. `Workflows` is discoverable in the native command palette, but selecting it did not navigate the app.
3. `Notifications` is not exposed as a desktop destination; the command palette returns no matching content or commands.

## Verified Passes

### Chat

- Pass: authenticated app launch lands in a live chat workspace.
- Evidence: [2026-04-11-macos-qa-chat.png](/Users/gallagherpropertycompany/Documents/gallagher-cres/docs/reports/assets/2026-04-11-macos-qa-chat.png)
- Notes:
  - Production chat shell rendered inside the macOS app.
  - Operator identity is visible in the desktop sidebar (`blake@gallagherpropco.com`).
  - Native inspector populated chat metrics.

### Map

- Pass: `Cmd+4` navigates to the map surface.
- Evidence: [2026-04-11-macos-qa-map.png](/Users/gallagherpropertycompany/Documents/gallagher-cres/docs/reports/assets/2026-04-11-macos-qa-map.png)
- Notes:
  - Interactive map canvas rendered.
  - Native inspector switched to `Map Workspace`.

### Runs

- Pass: `Cmd+6` navigates to the runs surface.
- Evidence: [2026-04-11-macos-qa-runs.png](/Users/gallagherpropertycompany/Documents/gallagher-cres/docs/reports/assets/2026-04-11-macos-qa-runs.png)
- Notes:
  - `Run History` loaded in the web workspace.
  - Native inspector switched to `Run Monitor`.

## Failures / Gaps

### Deals Route Mismatch

- Fail: native desktop route selection updates the inspector to `Deal Workspace`, but the embedded production page does not land on a usable deals workspace.
- Evidence: [2026-04-11-macos-qa-deals-mismatch.png](/Users/gallagherpropertycompany/Documents/gallagher-cres/docs/reports/assets/2026-04-11-macos-qa-deals-mismatch.png)
- Root-cause finding:
  - The production `/deals` route itself returns a redirect-to-`/login` response even when sent the same full authenticated Auth.js cookie jar that works for `/chat`, `/command-center`, and authenticated API routes.
  - That means the remaining `Deals` gap is not just a macOS shell navigation bug; it is blocked by the underlying production route/auth contract for this desktop-auth bootstrap method.
- Interpretation:
  - Native route selection is firing.
  - The desktop shell cannot reliably show the production deals page until the production deals route accepts the same authenticated session used by the rest of the operator shell, or the desktop app gets a stronger first-party session bootstrap.

### Workflows Navigation

- Partial fix shipped:
  - The desktop route now points to the canonical production destination `/automation?tab=builder`.
  - The native command palette now supports highlighted selection with Enter instead of a naive first-result submit path.
- Remaining status:
  - I did not get a clean final visual confirmation after the patch because the packaged macOS app window became intermittently minimized/hidden during automation and had to be manually recovered several times.
- Prior evidence:
  - Command found before fix: [2026-04-11-macos-qa-workflows-command.png](/Users/gallagherpropertycompany/Documents/gallagher-cres/docs/reports/assets/2026-04-11-macos-qa-workflows-command.png)
  - No navigation before fix: [2026-04-11-macos-qa-workflows-no-nav.png](/Users/gallagherpropertycompany/Documents/gallagher-cres/docs/reports/assets/2026-04-11-macos-qa-workflows-no-nav.png)

### Notifications Surface Missing

- Fixed in code:
  - Added a first-class `Notifications` desktop route.
  - Added sidebar/menu-bar/navigation-menu coverage.
  - Added native notifications inspector data from `/api/notifications` and `/api/notifications/unread-count`.
- Remaining status:
  - I did not get a clean final route screenshot after the patch because the packaged app repeatedly lost its visible window during automation.
- Prior evidence before fix:
  - [2026-04-11-macos-qa-notifications-missing.png](/Users/gallagherpropertycompany/Documents/gallagher-cres/docs/reports/assets/2026-04-11-macos-qa-notifications-missing.png)

## Additional Notes

- The prior `Live stack degraded` inspector state is fixed. During route changes the transient connectivity badge can still appear while checks run, but the message now resolves to operator APIs being healthy rather than a false degraded state.
- The authenticated app process and window were verified fresh for this sweep before captures were taken.

## Recommended Next Fix Order

1. Resolve the production `/deals` auth redirect behavior for desktop-bootstrapped sessions, or add a stronger first-party session bootstrap in the macOS app.
2. Re-run a focused visual sweep for patched `Workflows` and `Notifications` once the packaged-window automation is stable again.
