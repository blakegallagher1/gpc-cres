# Map UI "Command Surface" Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Transform the `/map` page from a cluttered dashboard into a clean command surface where the map dominates and controls appear contextually.

**Architecture:** Rework 3 existing components (MapSituationStrip, MapOperatorConsole, MapPageClient layout) without changing map rendering logic, data fetching, or parcel interaction behavior. Pure UI/UX layer changes.

**Tech Stack:** React, Tailwind CSS, Framer Motion, Lucide icons, shadcn/ui

**Design doc:** Approved in conversation — "Command Surface" direction.

---

## Design Principles

1. **Map owns the screen.** Right sidebar hidden by default. Controls overlay the map with glass-morphism.
2. **Contextual density.** Show metrics only when they have meaningful values (tracked count appears only when > 0).
3. **No UI documentation in the UI.** Remove all paragraph descriptions from sections. Use icons + single-line labels.
4. **Reduce, don't relocate.** Don't move clutter to a different panel — eliminate it.

---

### Task 1: Redesign MapSituationStrip — Minimal Floating HUD

**Files:**
- Modify: `apps/web/components/maps/MapSituationStrip.tsx`

**Current:** 8 badges in a full-width border-bottom bar.
**After:** 2-3 contextual pills floating over the top-left of the map. Only show non-zero values.

**Step 1: Rewrite MapSituationStrip**

```tsx
"use client";

import { cn } from "@/lib/utils";

export interface MapSituationStripProps {
  selectedCount: number;
  trackedCount: number;
  openTaskCount: number;
  analysisCount: number;
  overlayCount: number;
  drawMode: "idle" | "drawing" | "polygon";
  dataFreshnessLabel: string;
  latencyLabel: string;
}

function Pill({ children, accent }: { children: React.ReactNode; accent?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-medium tracking-wide backdrop-blur-md",
        accent
          ? "bg-map-accent/20 text-map-accent ring-1 ring-map-accent/30"
          : "bg-map-surface/70 text-map-text-secondary ring-1 ring-map-border/50",
      )}
    >
      {children}
    </span>
  );
}

export function MapSituationStrip({
  selectedCount,
  trackedCount,
  openTaskCount,
  overlayCount,
  drawMode,
  dataFreshnessLabel,
  latencyLabel,
}: MapSituationStripProps) {
  // Only render pills for non-zero / active states
  const pills: { key: string; label: string; accent?: boolean }[] = [];

  if (selectedCount > 0) pills.push({ key: "sel", label: `${selectedCount} selected`, accent: true });
  if (trackedCount > 0) pills.push({ key: "trk", label: `${trackedCount} tracked` });
  if (openTaskCount > 0) pills.push({ key: "tsk", label: `${openTaskCount} tasks` });
  if (overlayCount > 0) pills.push({ key: "ovl", label: `${overlayCount} overlays` });
  if (drawMode !== "idle") pills.push({ key: "drw", label: `Drawing`, accent: true });

  // Always show freshness + latency as a single subtle pill
  pills.push({ key: "sys", label: `${dataFreshnessLabel} · ${latencyLabel}` });

  if (pills.length === 0) return null;

  return (
    <div className="pointer-events-none absolute left-3 top-3 z-10 flex flex-wrap items-center gap-1.5">
      {pills.map((p) => (
        <Pill key={p.key} accent={p.accent}>
          {p.label}
        </Pill>
      ))}
    </div>
  );
}
```

**Step 2: Update MapPageClient to render strip as map overlay**

In `MapPageClient.tsx`, change the MapSituationStrip from being a sibling above the map to being positioned inside the map container (absolute overlay).

Find the current layout (approx lines 1367-1395):
```tsx
<DashboardShell ...>
  <MapSituationStrip ... />    {/* ← Currently here, takes full width */}
  <div className="flex flex-1 overflow-hidden">
```

Move it inside the map's flex container as an absolute overlay:
```tsx
<DashboardShell ...>
  <div className="relative flex flex-1 overflow-hidden">
    <div className="relative flex-1 flex flex-col">
      <MapSituationStrip ... />    {/* ← Now absolute-positioned inside map area */}
      {/* SearchSlot */}
      {/* ParcelMap */}
    </div>
```

**Step 3: Verify and commit**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json`
Expected: Clean (no type errors)

```bash
git add apps/web/components/maps/MapSituationStrip.tsx apps/web/app/map/MapPageClient.tsx
git commit -m "refactor(map): replace status bar with contextual floating HUD pills"
```

---

### Task 2: Slim Down MapOperatorConsole — Remove Verbosity

**Files:**
- Modify: `apps/web/components/maps/MapOperatorConsole.tsx`

**Current:** 3 verbose sections with SectionHeader (eyebrow + title + body paragraph), 4 MetricCell grid, source/freshness/latency badges.
**After:** Compact header with minimal metrics, no paragraph descriptions, workflow buttons inline.

**Step 1: Remove SectionHeader component and all verbose descriptions**

Delete the `SectionHeader` component entirely. Replace all `<SectionHeader>` usages with a single-line label:

```tsx
// Replace SectionHeader with this
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-map-text-muted">
      {children}
    </p>
  );
}
```

**Step 2: Redesign the console header**

Replace the current header (lines 228-264) — remove the subtitle paragraph, the description paragraph, the 4-cell metric grid, and the source/freshness/latency badges. Replace with:

```tsx
<div className="border-b border-map-border px-4 py-3">
  <div className="flex items-center justify-between">
    <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-map-text-muted">
      Console
    </p>
    <div className="flex items-center gap-3 text-[10px] text-map-text-muted">
      <span>{visibleCount} in view</span>
      {selectedParcels.length > 0 && (
        <span className="text-map-accent">{selectedParcels.length} selected</span>
      )}
    </div>
  </div>
</div>
```

**Step 3: Simplify the Workflow Lane section**

Replace the SectionHeader + description + two card buttons with compact inline buttons:

```tsx
<section className="space-y-2">
  <SectionLabel>Tools</SectionLabel>
  <div className="flex gap-2">
    <button
      type="button"
      onClick={() => onActivePanelChange("chat")}
      className={cn(
        "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors",
        activePanel === "chat"
          ? "border-map-accent bg-map-accent/10 text-map-text-primary"
          : "border-map-border bg-map-surface/45 text-map-text-secondary hover:bg-map-surface",
      )}
    >
      <Bot className="h-3.5 w-3.5" />
      Copilot
    </button>
    <button
      type="button"
      onClick={() => onActivePanelChange("prospecting")}
      className={cn(
        "flex flex-1 items-center gap-2 rounded-lg border px-3 py-2 text-[11px] font-medium transition-colors",
        activePanel === "prospecting"
          ? "border-map-accent bg-map-accent/10 text-map-text-primary"
          : "border-map-border bg-map-surface/45 text-map-text-secondary hover:bg-map-surface",
      )}
    >
      <Radar className="h-3.5 w-3.5" />
      Prospect
    </button>
  </div>
</section>
```

**Step 4: Simplify the Selection Notebook section**

Remove: SectionHeader description, the 3-col Matches/Nearby/Blocked MetricCell grid, the "Saving pins the parcel..." help text.

Keep: Selected parcel chips, task input, note textarea, save button. The section only renders when `selectedParcels.length > 0`.

**Step 5: Simplify the Selection Brief section**

Remove: SectionHeader with "Run the parcel screen before you advance it" description.
Keep: Just the ScreeningScorecard component with a thin label.

**Step 6: Simplify the Tracked Parcels section**

Remove: SectionHeader description paragraph.
Keep: Just the list of tracked parcels with status badges.

**Step 7: Reduce sidebar width**

In `MapPageClient.tsx`, change the sidebar width from `xl:w-[360px]` to `xl:w-[300px]`.

**Step 8: Verify and commit**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json`
Expected: Clean

```bash
git add apps/web/components/maps/MapOperatorConsole.tsx apps/web/app/map/MapPageClient.tsx
git commit -m "refactor(map): strip verbosity from operator console, compact layout"
```

---

### Task 3: Make Right Sidebar Collapsible

**Files:**
- Modify: `apps/web/app/map/MapPageClient.tsx`

**Current:** Right sidebar is always visible on xl+ screens with no toggle.
**After:** Sidebar collapsed by default. A small toggle button on the map edge opens/closes it with a slide animation.

**Step 1: Add sidebar state**

In MapPageClient, add:
```tsx
const [sidebarOpen, setSidebarOpen] = useState(false);
```

**Step 2: Add toggle button and animate sidebar**

Replace the static sidebar div with:

```tsx
{/* Sidebar toggle button — always visible */}
<button
  type="button"
  onClick={() => setSidebarOpen(!sidebarOpen)}
  className="absolute right-0 top-1/2 z-20 hidden -translate-y-1/2 xl:flex h-10 w-5 items-center justify-center rounded-l-md border border-r-0 border-map-border bg-map-surface-overlay/90 text-map-text-muted hover:text-map-text-primary backdrop-blur-md transition-colors"
  style={{ right: sidebarOpen ? "300px" : 0 }}
>
  {sidebarOpen ? "›" : "‹"}
</button>

{/* Collapsible sidebar */}
<motion.div
  initial={false}
  animate={{ width: sidebarOpen ? 300 : 0 }}
  transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
  className="hidden xl:block overflow-hidden border-l border-map-border"
>
  <div className="w-[300px]">
    <MapOperatorConsole ... />
  </div>
</motion.div>
```

**Step 3: Auto-open sidebar when parcels are selected**

```tsx
useEffect(() => {
  if (selectedParcelIds.size > 0 && !sidebarOpen) {
    setSidebarOpen(true);
  }
}, [selectedParcelIds.size]);
```

**Step 4: Verify and commit**

```bash
git add apps/web/app/map/MapPageClient.tsx
git commit -m "feat(map): make right sidebar collapsible, auto-open on selection"
```

---

### Task 4: Remove Redundant Map Copilot Floating Widget

**Files:**
- Modify: `apps/web/components/maps/MapLibreParcelMap.tsx` (if the floating widget is here)
- Or: `apps/web/app/map/MapPageClient.tsx`

**Current:** A "Map Copilot / 0 IN VIEW" chip floats in the top-right of the map, overlapping content and duplicating the sidebar's copilot button.
**After:** Removed entirely. The copilot is accessed via the sidebar's Copilot button or a keyboard shortcut.

**Step 1: Find and remove the floating Map Copilot widget**

Search for the component rendering "Map Copilot" + "IN VIEW" in the map area. This is likely a floating div in MapPageClient or passed as a child to ParcelMap.

Remove it. The sidebar "Copilot" button is the single entry point.

**Step 2: Verify and commit**

```bash
git commit -m "refactor(map): remove redundant floating copilot widget"
```

---

### Task 5: Final Polish — Visual Refinements

**Files:**
- Modify: `apps/web/components/maps/MapSituationStrip.tsx`
- Modify: `apps/web/components/maps/MapOperatorConsole.tsx`
- Modify: `apps/web/app/map/MapPageClient.tsx`

**Step 1: Add subtle entrance animations to HUD pills**

Use `motion.span` with staggered `delay` for pill entrance.

**Step 2: Add keyboard shortcut hint**

In the collapsed state, the toggle button shows `[` as a keyboard hint. Add `useEffect` to listen for `[` key to toggle sidebar.

**Step 3: Verify, test, commit**

Run: `npx tsc --noEmit --project apps/web/tsconfig.json`
Run: `pnpm test -- --passWithNoTests`

```bash
git add -A
git commit -m "feat(map): command surface UI redesign complete

- Floating HUD pills replace full-width status bar
- Right sidebar collapsed by default, auto-opens on selection
- All verbose section descriptions removed
- Sidebar width 360→300px
- Floating copilot widget removed (sidebar button is entry point)
- Keyboard shortcut [ to toggle sidebar"
```

---

## Checklist

- [ ] Task 1: MapSituationStrip → floating HUD pills
- [ ] Task 2: MapOperatorConsole → strip verbosity, compact layout
- [ ] Task 3: Right sidebar → collapsible with toggle
- [ ] Task 4: Remove floating Map Copilot widget
- [ ] Task 5: Polish — animations, keyboard shortcut
