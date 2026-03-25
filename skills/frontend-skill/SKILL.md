---
name: frontend-skill
description: Use when the task asks for a visually strong landing page, website, app, prototype, demo, dashboard, or operational UI. This skill enforces restrained composition, image-led hierarchy, cohesive content structure, tasteful motion, and GPC codebase conventions — avoiding generic cards, weak branding, UI clutter, and code that violates Entitlement OS architecture rules. Triggers on any frontend build, redesign, new page, new component, or UI polish request.
---

# Frontend Skill — Gallagher Property Company / Entitlement OS

This skill fuses the OpenAI Frontend Skill (from "Designing Delightful Frontends with GPT-5.4") with the Entitlement OS codebase conventions. Use it when quality depends on art direction, hierarchy, restraint, imagery, motion, AND correctness within the GPC monorepo.

**Goal:** Ship interfaces that feel deliberate, premium, and current — AND that compile, pass QA, respect the OKLCH token system, and follow every codebase rule in CLAUDE.md.

---

## PHASE 0 ▸ OPERATING RULES

**Autonomy:** Proactively gather context, plan, implement, test, and refine end-to-end. Do not stop at analysis. Do not ask for clarification. Make strong default decisions and state them in one sentence.

**ROADMAP-FIRST gate:** Before writing component code, read `ROADMAP.md`. Only build features marked `Planned` or in-progress. If this task is new, write a one-paragraph value-analysis (problem, outcome, evidence, acceptance criteria) at the top of your plan. Skip only for pure visual polish with zero behavior change.

**Persistence:** Incomplete until all litmus checks pass and Playwright QA signs off. Two fallback strategies before marking anything `[blocked]`.

**Parallel tool use:** Batch all independent reads into a single parallel call. Never read files one-by-one.

**Reasoning level:** LOW for layout/styling. MEDIUM for data-wired or stateful surfaces. Never HIGH — it produces overthought, worse visual results.

**Surface type detection:**

| Signal | Mode |
|--------|------|
| Route under `/deals`, `/map`, `/chat`, `/command-center`, `/admin`, `/screening`, `/runs`, `/settings`, `/portfolio`, `/prospecting` | **Operational** |
| Route under `/`, `/login`, `/signup`, or any public-facing page | **Marketing** |
| External URL (not gallagherpropco.com) | **Reference extraction** → adapt to GPC tokens |
| Component-only build | **Operational** (default) |

**Compaction survivors:** (1) design tokens, (2) visual thesis, (3) build state, (4) QA inventory, (5) divergences detected.

---

## PHASE 1 ▸ CODEBASE EXTRACTION

Read in parallel before ANY implementation:

```
apps/web/app/globals.css                            # OKLCH tokens, @theme inline, :root + .dark
apps/web/app/layout.tsx                             # Font loading, providers, body class
apps/web/components/layout/DashboardShell.tsx        # Shell structure, CSS vars, AuthGuard
apps/web/components/layout/Sidebar.tsx               # Nav rail, easing [0.22,1,0.36,1], collapse
apps/web/components/layout/Header.tsx                # Fixed header, command palette, route context
apps/web/components/transitions/PageTransition.tsx   # PageTransition, StaggerContainer, StaggerItem, FadeIn, ScaleOnHover, LoadingSpinner
apps/web/stores/uiStore.ts                          # Zustand: sidebar, commandPalette, copilot
```

Plus target-specific: nearest existing page, relevant `components/[domain]/`, `components/skeletons/`, `hooks/useIsMobile.ts`.

### Tech Stack

| Layer | Tech | Version |
|-------|------|---------|
| Framework | Next.js App Router | 16.1.6 |
| UI | React + shadcn/ui + Radix + Tailwind CSS v4 | React 19 |
| State | Zustand | 4.5.5 |
| Data | SWR | 2.4.0 |
| Animation | Framer Motion | — |
| ORM | Prisma | 6.4.1 |
| Auth | NextAuth v5 | — |
| Icons | Lucide React | — |
| Agent SDK | @openai/agents | 0.4.15 |
| Agent Runtime | CF Workers + Durable Objects (WebSocket) | — |

### OKLCH Token System

All colors are 3-value OKLCH tuples consumed via `oklch(var(--token))` through Tailwind v4 `@theme inline`.

**Light (`:root`):**
```
--background: 1 0 0
--foreground: 0.141 0.005 285.82
--card: 1 0 0 / --card-foreground: 0.141 0.005 285.82
--primary: 0.141 0.005 285.82 / --primary-foreground: 0.985 0 0
--secondary: 0.967 0.001 286.38 / --secondary-foreground: 0.141 0.005 285.82
--muted: 0.967 0.001 286.38 / --muted-foreground: 0.552 0.016 285.94
--accent: 0.967 0.001 286.38 / --accent-foreground: 0.141 0.005 285.82
--destructive: 0.577 0.245 27.33 / --destructive-foreground: 0.985 0 0
--border: 0.92 0.004 286.32 / --input: 0.92 0.004 286.32 / --ring: 0.92 0.004 286.32
--sidebar: 0.985 0 0 / --sidebar-foreground: 0.141 0.005 285.82
--sidebar-primary: 0.141 0.005 285.82 / --sidebar-accent: 0.967 0.001 286.38
--sidebar-border: 0.92 0.004 286.32 / --sidebar-ring: 0.871 0.006 286.29
--shell-glow: 0.93 0.02 213.64
--shell-surface: 0.994 0.002 286.32
--shell-surface-elevated: 0.978 0.004 286.24
--shell-line: 0.87 0.01 258.34
--shell-grid: 0.53 0.016 285.94
--shell-accent: 0.72 0.05 237.2
--radius: 0.5rem
```

**Dark (`.dark`):**
```
--background: 0.141 0.005 285.82 / --foreground: 0.985 0 0
--card: 0.141 0.005 285.82 / --primary: 0.985 0 0
--secondary: 0.218 0.006 285.75 / --muted: 0.218 0.006 285.75
--muted-foreground: 0.716 0.01 285.96 / --accent: 0.218 0.006 285.75
--destructive: 0.396 0.141 25.72 / --border: 0.218 0.006 285.75
--ring: 0.871 0.006 286.29
--shell-glow: 0.38 0.03 252.91 / --shell-surface: 0.218 0.006 285.75
--shell-surface-elevated: 0.266 0.008 284.97 / --shell-line: 0.36 0.008 281.42
--shell-grid: 0.72 0.01 285.96 / --shell-accent: 0.78 0.04 237.2
```

### Shell Dimensions
```css
--app-header-height: 5rem;
--app-sidebar-expanded: 18rem;
--app-sidebar-collapsed: 5.5rem;
```
Content: `pt-[var(--app-header-height)]` + `pl-[var(--app-sidebar-expanded|collapsed)]`. Default padding: `px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5`. Full-height: `min-h-[calc(100svh-var(--app-header-height))]`.

### Typography
```
Instrument Sans — Display + body. Weights: 400, 500, 600, 700. Variable: --font-sans
DM Mono — Data, IDs, coordinates, timestamps, code. Weights: 300, 400, 500. Variable: --font-mono
```
Both loaded via `next/font/google` in `layout.tsx`. DO NOT re-import or substitute.

| Role | Font | Weight | Usage |
|------|------|--------|-------|
| Display | Instrument Sans | 700 | Hero headlines (marketing only) |
| Headline | Instrument Sans | 600 | Section headings, panel titles |
| Body | Instrument Sans | 400–500 | Paragraphs, UI labels |
| Data | DM Mono | 400 | Parcel IDs, acreage, lat/lng, timestamps, metrics |
| Code | DM Mono | 300–400 | Tool names, API endpoints, inline code |

### Animation Primitives (USE THESE — do not reinvent)

| Component | Behavior |
|-----------|----------|
| `PageTransition` | Route fade+slide `y:10→0`, spring `300/30`, `0.2s` |
| `StaggerContainer` | Stagger orchestrator, default `0.05s` delay |
| `StaggerItem` | Child spring `y:20→0`, `300/30` |
| `FadeIn` | Opacity+y, cubic `[0.25,0.1,0.25,1]`, `0.3s` |
| `ScaleOnHover` | `whileHover: 1.02`, `whileTap: 0.98`, spring `400/25` |
| `LoadingSpinner` | Infinite rotation |

**Shell easing:** `[0.22, 1, 0.36, 1]` @ `0.24–0.28s` — for sidebar, header, drawers.
**Content spring:** `stiffness: 300, damping: 30` — for reveals, list items, cards.
**ALL motion MUST check `useReducedMotion()` and disable when preferred.**

### State Management

| Store | Purpose |
|-------|---------|
| `useUIStore` (Zustand) | sidebar, commandPalette, copilot toggles |
| `useAgentStore` | Agent run state |
| `useFinancialModelStore` | Pro forma / waterfall calc |
| `useNotificationStore` | Notification feed |
| SWR | Server data fetching |

### Component Inventory (check BEFORE writing new components)
```
components/ui/           — shadcn primitives (Button, Card, Badge, Table, Dialog, Sheet, Tabs, Skeleton, Command…)
components/layout/       — DashboardShell, Sidebar, Header, WorkspaceHeader
components/transitions/  — PageTransition, StaggerContainer, StaggerItem, FadeIn, ScaleOnHover, LoadingSpinner
components/skeletons/    — DashboardSkeleton, TableSkeleton
components/deals/        — Deal pipeline UI
components/maps/         — Map panel, parcel overlays
components/chat/         — Agent chat interface
components/copilot/      — CopilotPanel
components/command-palette/ — CommandPalette (Cmd+K)
components/financial/    — Pro forma, waterfall, debt comparison
components/intelligence/ — Screening, environmental intel
hooks/                   — useIsMobile, useParcelScreening, useProFormaCalculations, useWaterfallCalculations
```

**NEVER re-implement a shadcn/ui primitive or an existing transition component.**

### Route Architecture

All authenticated routes render inside `DashboardShell` → `AuthGuard` → shell → `Sidebar` → `Header` → `<main>` (with `PageTransition`) → `CommandPalette` → `CopilotPanel`.

Nav groups: **Pinned:** Chat. **Operate:** Command Center, Deals, Map, Screening, Prospecting, Opportunities. **Analyze:** Portfolio, Market, Runs, Agent State. **Footer:** Settings, Admin.

---

## PHASE 2 ▸ EXTERNAL SURFACE INSPECTION (if target includes a URL)

Skip if target is a route path, component name, or Figma link.

If a URL is provided, crawl and extract: brand identity, color system (exact hex), typography (rendered styles), content/structure (section-by-section), visual character (mood, density, whitespace), motion/interaction patterns, functional patterns.

**Adaptation rule:** Extract their design language but MAP it onto GPC's OKLCH tokens, Instrument Sans + DM Mono, and shadcn/ui. Note every substitution.

---

## PHASE 3 ▸ WORKING MODEL (write before ANY code)

**1. Visual thesis** — One sentence: mood, material, energy.
- Operational: "Dense information hierarchy — structured whitespace, monospace data labels, calm OKLCH layering, single shell-accent for interactive state."
- Marketing: "[Mood] [material] [energy] — [font treatment], [color strategy], [motion personality], [imagery approach]."

**2. Content plan** — Map every section/panel. Each: one job, one dominant visual/data concept, one action.
- Operational: Orient → Status → Act. Headings = what the area IS or what the operator CAN DO.
- Marketing: Hero → Support → Detail → Social proof → Final CTA. Six sections max.

**3. Interaction thesis** — 2–3 motion ideas derived from existing primitives (Phase 1). Reference shell easing or content spring. Not invented from scratch.

---

## PHASE 4 ▸ BEAUTIFUL DEFAULTS (from OpenAI Frontend Skill)

- Start with composition, not components.
- Prefer a full-bleed hero or full-canvas visual anchor.
- Make the brand or product name the loudest text.
- Keep copy short enough to scan in seconds.
- Use whitespace, alignment, scale, cropping, and contrast before adding chrome.
- Two typefaces max (Instrument Sans + DM Mono). One accent color by default (`--shell-accent`).
- Default to CARDLESS layouts. Sections, columns, dividers, lists, media blocks.
- Treat the first viewport as a poster, not a document.

---

## PHASE 5 ▸ DESIGN SYSTEM RULES (locked)

**Color — Tailwind utilities ONLY:**
```
bg-background  bg-card  bg-muted  bg-sidebar  bg-primary  bg-secondary  bg-destructive
text-foreground  text-muted-foreground  text-primary-foreground
border-border  ring-ring
```

**Shell-layer tokens:**
```css
var(--color-shell-surface)           /* elevated panel bg — use instead of bg-white */
var(--color-shell-surface-elevated)  /* second elevation */
var(--color-shell-line)              /* subtle rules */
var(--color-shell-accent)            /* interactive blue-gray */
var(--color-shell-glow)              /* glow/halo */
```

**NEVER:** raw hex in components, `bg-white`, `bg-black`, `bg-gray-*`, `text-gray-*`, system fonts, custom border-radius values.

**Spacing:** `p-4`/`p-6` panels, `px-4 pb-6 pt-4 md:px-6 md:pb-8 md:pt-5` content area, `gap-2` tight / `gap-4` standard / `gap-6` breathing room, `space-y-6` section stacking.

**Radius:** `rounded-sm` / `rounded-md` / `rounded-lg` / `rounded-xl` from `--radius: 0.5rem` scale.

---

## PHASE 6 ▸ COMPOSITION RULES

### 6A — Operational UI (Linear-style restraint)

**Surface hierarchy:** `bg-background` → `shell-surface` → `shell-surface-elevated` → interactive element. One accent (`--shell-accent`). `--destructive` only for destructive actions.

**Layout:** Default CARDLESS. Cards ONLY when card IS the interaction container. Tables over card grids for list views. Panels: full height, `overflow-y-auto`, sticky header inside scrollable content.

**Copy:** Headings = what the area IS or what the operator CAN DO. Support text: one sentence max (scope, freshness, behavior, decision value). Labels: concise, no articles. Status badges: operational state only. CTAs: clear imperatives.

**Utility copy rules (from OpenAI blog):**
- Prioritize orientation → status → action (not promise → mood → brand)
- Section headings: "Selected KPIs", "Plan status", "Search metrics", "Last sync"
- If a sentence could appear in a homepage hero, rewrite until it sounds like product UI
- If a section doesn't help someone operate, monitor, or decide — remove it
- Litmus: if an operator scans only headings, labels, and numbers, can they understand the page?

### 6B — Marketing Pages (award-caliber)

**Hero:** One composition. Full-bleed edge to edge — no inherited gutters. Brand = loudest text. Budget: brand mark, headline (2–3 lines), one sentence, CTA group, dominant image. NOTHING ELSE. Sticky header counts against viewport budget — use `calc(100svh - var(--app-header-height))`.

**Brand test:** If the first viewport could belong to another company after removing the nav, branding is weak.
**Remove-image test:** If the page still works after removing the hero image, the image is doing nothing.

**Sections:** Six max. One job each. One headline. One sentence of support. Default CARDLESS.

**Copy:** Product language, not design commentary. Headline carries meaning. Cut repetition. If deleting 30% improves the page, keep deleting.

**Imagery (for generated assets):**
- Narrative work, not space-filling. Louisiana CRE: industrial landscape, outdoor storage, truck parking, aerial property photography, golden-hour light.
- Stable tonal area for text overlay. No embedded signage fighting UI. No AI-generated UI frames or collages.
- First viewport NEEDS a real visual anchor — decorative texture is not enough.
- Prefer in-situ photography over abstract gradients or fake 3D.

---

## PHASE 7 ▸ MOTION

Use motion for presence and hierarchy, not noise. **Minimum 2–3 intentional motions:**

1. One entrance sequence (page-level: `PageTransition` already handles. Panel/drawer/modal: `AnimatePresence` + `motion.div`)
2. One scroll-linked, sticky, or depth effect (or skeleton → resolved data transition)
3. One hover/reveal/layout transition that sharpens affordance (`ScaleOnHover`, focus ring, active state)

**Use existing primitives first** (`PageTransition`, `StaggerContainer`, `StaggerItem`, `FadeIn`, `ScaleOnHover`). Custom Framer Motion only when no existing component fits.

**Canonical curves:**
- Shell: `[0.22, 1, 0.36, 1]` @ `0.24s` — sidebar, header, drawers
- Content spring: `stiffness: 300, damping: 30` — reveals, list items
- Fade: `[0.25, 0.1, 0.25, 1]` @ `0.3s` — opacity-only

**Motion rules (ALL must pass):**
- ✓ Noticeable at normal speed
- ✓ Smooth on mobile (390×844)
- ✓ Fast — 0.15–0.3s, never slow or floaty
- ✓ Consistent easing across the surface
- ✓ Respects `useReducedMotion()`
- ✗ Remove immediately if ornamental only

---

## PHASE 8 ▸ TECHNICAL IMPLEMENTATION

### Data Access
```typescript
// Property data — ONLY via gateway client
import "server-only"
import { getGatewayClient } from "@/lib/server/gatewayClient"

// App DB — ONLY via Prisma with orgId
import { prisma } from "@entitlement-os/db"
const deal = await prisma.deal.findFirstOrThrow({ where: { id, orgId } })

// Events — fire-and-forget
import "@/lib/automation/handlers"
dispatchEvent(event).catch(() => {})
```

### File Placement
```
Page:      apps/web/app/[route]/page.tsx
Layout:    apps/web/app/[route]/layout.tsx
Component: apps/web/components/[domain]/ComponentName.tsx
Hook:      apps/web/hooks/use-feature-name.ts
Utility:   apps/web/lib/[domain]/util-name.ts          ← force-add to git!
API route: apps/web/app/api/[route]/route.ts
Store:     apps/web/stores/featureStore.ts
Skeleton:  apps/web/components/skeletons/FeatureSkeleton.tsx
```

### Shell Integration
Every authenticated page MUST render inside `DashboardShell`:
```typescript
import { DashboardShell } from "@/components/layout/DashboardShell"
export default function Layout({ children }) {
  return <DashboardShell>{children}</DashboardShell>
}
// noPadding for full-bleed (maps, flow editors):
<DashboardShell noPadding>{children}</DashboardShell>
```

### Hard Code Rules
- No `any` — `Record<string, unknown>` for dynamic objects
- `.nullable()` not `.optional()` for Zod fields
- Never `z.string().url()` or `z.string().email()` — plain `z.string()`
- `import "server-only"` in modules touching secrets or gateway
- `dispatchEvent().catch(() => {})` — ALWAYS
- Every Prisma query scoped with `orgId`
- Server secrets NEVER prefixed `NEXT_PUBLIC_`
- Force-add `apps/web/lib/` files to git
- Components: PascalCase. Hooks: `use*`. Constants: UPPER_SNAKE_CASE. Tools: snake_case

### Responsive
- Desktop-first @ 1440×900, mobile-verified @ 390×844
- Touch targets ≥ 44px on mobile
- Use `useIsMobile()` from `@/hooks/useIsMobile`

### Deploy
```bash
rm -rf apps/web/.next/          # before CLI deploy
vercel deploy --archive=tgz     # >15K files
git add -f apps/web/lib/        # force-add lib files
```

---

## PHASE 9 ▸ PLAYWRIGHT VISUAL QA (mandatory)

Tests in `apps/web/e2e/`. NOT optional.

**Viewports:** Desktop `1440×900`, Mobile `390×844` (isMobile, hasTouch).

**Write QA inventory first** — every requirement, state, fetch, motion claim.

**Functional pass:** Navigate route, trigger all interactive elements, verify data loads, verify forms, check console (unhandled rejections, missing orgId, hydration).

**Visual pass:** Screenshot both viewports, verify token usage, verify dark mode (`.dark` class toggle), verify skeletons, trigger and verify motion, confirm no failure patterns.

**Fix loop:** Fix → reload → re-run failed checks → repeat until all pass.

**Signoff (ALL true):**
- [ ] Every QA item tested with real interaction
- [ ] Zero console errors
- [ ] Dark mode verified
- [ ] Both viewport screenshots captured
- [ ] Reduced motion tested
- [ ] No failure patterns present

---

## PHASE 10 ▸ HARD RULES (non-negotiable — violating any is a build failure)

- No cards by default
- No hero cards by default
- No boxed or center-column hero when full-bleed is specified
- No more than one dominant idea per section
- No section should need many tiny UI devices to explain itself
- No headline should overpower the brand on branded pages
- No filler copy — no placeholder text — no design commentary in UI
- No split-screen hero unless text sits on a calm, unified side
- No more than two typefaces (Instrument Sans + DM Mono)
- No more than one accent color (`--shell-accent`) unless explicit request
- No `any` TypeScript anywhere
- No Prisma query without `orgId`
- No `dispatchEvent()` without `.catch(() => {})`
- No animation without `useReducedMotion()` check
- No new component that duplicates existing shadcn/ui or transitions component
- No raw hex in components — OKLCH tokens only
- No system fonts rendered anywhere

## REJECT THESE FAILURES (rebuild immediately on detection)

- Generic SaaS card grid as first impression
- Beautiful image with weak brand presence
- Strong headline with no clear action
- Busy imagery behind text without contrast treatment
- Sections repeating the same mood statement
- Carousel with no narrative purpose
- App UI made of stacked cards instead of real layout
- Marketing-style hero in an operational surface
- Decorative gradient behind data content
- Card grid where a `<Table>` serves the operator better
- Multiple competing accent colors
- Thick borders on every panel region
- Placeholder copy ("Lorem ipsum", "Unlock your potential")

## LITMUS CHECKS (run before delivery — fix any failure)

- [ ] Brand/product unmistakable in first screen?
- [ ] One strong visual anchor (not decorative texture)?
- [ ] Page understood by scanning headlines only?
- [ ] Each section has exactly one job?
- [ ] Cards only where card IS the interaction?
- [ ] Motion improves hierarchy or atmosphere (not just exists)?
- [ ] Design still premium if all decorative shadows removed?
- [ ] OKLCH tokens in both light and dark modes?
- [ ] Both typefaces rendering correctly?
- [ ] Shell dimensions match (`5rem` header, `18rem`/`5.5rem` sidebar)?
- [ ] All code rules pass (no `any`, orgId scoped, events caught)?
- [ ] Playwright QA passed at both viewports?
- [ ] ROADMAP.md updated with completed work?

---

## PHASE 11 ▸ FIGMA ROUND-TRIP (if connected)

**Design → Code:** If Figma URL provided, extract via MCP, map Figma tokens to GPC OKLCH tokens.
**Code → Canvas:** After build, offer to generate editable Figma file for team iteration.

---

## USER TARGET

**Target:** {{TARGET}}
**Notes:** {{NOTES}}
