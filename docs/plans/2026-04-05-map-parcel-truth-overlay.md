# MAP-INTEL-001: Map Parcel Truth Overlay Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Surface chat-stored parcel knowledge (sale price, buyer, cap rate, etc.) on the map's ParcelDetailCard so operators see saved intel when clicking a parcel.

**Architecture:** New `useParcelTruth` SWR hook calls existing `GET /api/entities/lookup` with dual-path resolution (propertyDbId → parcelId → address). ParcelDetailCard renders a "Saved Intel" section from TruthView.currentValues when present. ChatContainer dispatches a `gpc:memory-updated` CustomEvent on store_memory completion so the hook can `mutate()` for near-instant refresh.

**Tech Stack:** React hooks, SWR, existing entity lookup API, existing TruthView service, CustomEvent API

---

## Task 1: Create `useParcelTruth` hook

**Files:**
- Create: `apps/web/hooks/useParcelTruth.ts`
- Reference: `apps/web/hooks/useParcelScreening.ts` (pattern to follow)
- Reference: `apps/web/lib/services/truthViewService.ts` (TruthView shape — server-only, define client types locally)
- Reference: `apps/web/app/api/entities/lookup/route.ts` (response shape)

**Step 1: Write the hook**

```typescript
// apps/web/hooks/useParcelTruth.ts
"use client";

import { useEffect } from "react";
import useSWR from "swr";

// Client-side types matching the JSON response from GET /api/entities/lookup
// (Cannot import TruthView from truthViewService.ts — it uses "server-only")

interface TruthValue {
  value: unknown;
  source: string;
  verifiedAt: string;
  correctedBy?: string;
}

interface OpenConflict {
  key: string;
  values: unknown[];
  draftIds: string[];
}

interface CorrectionEntry {
  key: string;
  oldValue: unknown;
  newValue: unknown;
  reason: string;
  correctedAt: string;
}

export interface ClientTruthView {
  currentValues: Record<string, TruthValue>;
  openConflicts: OpenConflict[];
  corrections: CorrectionEntry[];
}

interface EntityLookupResponse {
  found: boolean;
  entityId?: string;
  canonicalAddress?: string;
  parcelId?: string;
  truth?: ClientTruthView;
}

export interface UseParcelTruthParams {
  propertyDbId?: string | null;
  parcelId?: string;
  address?: string;
}

function buildLookupUrl(params: UseParcelTruthParams): string | null {
  // Prefer propertyDbId (property DB UUID) — most deterministic match
  if (params.propertyDbId) {
    return `/api/entities/lookup?parcel_id=${encodeURIComponent(params.propertyDbId)}`;
  }
  // Fallback to parcelId (assessor number)
  if (params.parcelId) {
    return `/api/entities/lookup?parcel_id=${encodeURIComponent(params.parcelId)}`;
  }
  // Last resort: address-based lookup
  if (params.address) {
    return `/api/entities/lookup?address=${encodeURIComponent(params.address)}`;
  }
  return null;
}

const fetcher = async (url: string): Promise<EntityLookupResponse> => {
  const res = await fetch(url);
  // Graceful degradation on auth failure — treat as "not found"
  if (res.status === 401 || res.status === 403) return { found: false };
  if (!res.ok) throw new Error(`Entity lookup failed: ${res.status}`);
  return res.json();
};

export function useParcelTruth(params: UseParcelTruthParams | null) {
  const url = params ? buildLookupUrl(params) : null;

  const { data, error, isLoading, mutate } = useSWR<EntityLookupResponse>(
    url,
    fetcher,
    {
      revalidateOnFocus: false,
      dedupingInterval: 5_000,
    },
  );

  // Listen for gpc:memory-updated events dispatched by ChatContainer
  // after a successful store_memory tool call — triggers SWR revalidation
  useEffect(() => {
    if (!url) return;
    const handler = () => {
      mutate();
    };
    window.addEventListener("gpc:memory-updated", handler);
    return () => window.removeEventListener("gpc:memory-updated", handler);
  }, [url, mutate]);

  const truth = data?.found ? data.truth ?? null : null;
  const entityId = data?.found ? data.entityId ?? null : null;

  return { truth, entityId, found: data?.found ?? false, error, isLoading };
}
```

**Step 2: Verify typecheck**

Run: `pnpm -C apps/web exec tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors related to useParcelTruth.ts

---

## Task 2: Add Saved Intel section to ParcelDetailCard

**Files:**
- Modify: `apps/web/components/maps/ParcelDetailCard.tsx`

**Step 1: Import the hook and add the section**

Add import at top:
```typescript
import { useParcelTruth, type ClientTruthView } from "@/hooks/useParcelTruth";
```

Add `SavedIntelSection` component and wire the hook into `ParcelDetailCard`.

The section renders inside the Details tab, between the Quick Economics block and the external links. Only appears when `truth` has comp.* values — completely hidden otherwise.

Key display fields from `truth.currentValues`:
- `comp.sale_price` → "Sale Price" (formatted as currency)
- `comp.sale_date` → "Sale Date"
- `comp.buyer` → "Buyer"
- `comp.seller` → "Seller"
- `comp.cap_rate` → "Cap Rate" (formatted as percentage)
- `comp.noi` → "NOI" (formatted as currency)
- `comp.price_per_acre` → "$/Acre" (formatted as currency)
- `comp.price_per_sf` → "$/SF" (formatted as currency)

Conflict badges: small amber dot next to fields that appear in `truth.openConflicts`.
Correction indicator: small "corrected" label on fields that have `correctedBy`.

**Step 2: Verify typecheck**

Run: `pnpm -C apps/web exec tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

---

## Task 3: Dispatch `gpc:memory-updated` from ChatContainer

**Files:**
- Modify: `apps/web/components/chat/ChatContainer.tsx`

**Step 1: Add dispatch logic**

In the SSE event handler (around the existing `tool_end`/`tool_result` block near line 578), add:

```typescript
if (
  (event.type === 'tool_end' || event.type === 'tool_result') &&
  event.name === 'store_memory'
) {
  window.dispatchEvent(new CustomEvent('gpc:memory-updated'));
}
```

This fires after every store_memory completion. The useParcelTruth hook's listener calls `mutate()` which triggers SWR revalidation — fetching fresh truth from the entity lookup endpoint.

**Step 2: Verify typecheck**

Run: `pnpm -C apps/web exec tsc --noEmit --pretty 2>&1 | head -20`
Expected: No errors

---

## Task 4: Final verification

Run: `pnpm typecheck && pnpm -C apps/web test -- components/maps/ParcelDetailCard`
Expected: All pass

---

## Acceptance Criteria

1. Click parcel with stored intel → truth values visible in "Saved Intel" section
2. Click parcel without stored intel → no empty section, no error, no visual noise
3. Store memory via chat → click same parcel → truth appears (near-instant with CustomEvent)
4. Rapid-click 5 parcels → SWR deduping prevents request storm
5. Expired session → graceful degradation (found: false), no error on card
6. `pnpm typecheck` passes
7. `pnpm test` passes (no regressions)
