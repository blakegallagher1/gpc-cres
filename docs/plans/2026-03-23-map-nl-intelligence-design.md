# Map Natural Language Intelligence — Design Document

**Date:** 2026-03-23
**Status:** Approved for implementation

## Problem

The map page has a search bar (address/parcel ID lookup only) and a chat panel (full agent conversation). Natural language questions like "How many parcels are zoned C2?" or "Find 10 industrial parcels near I-10" require opening the chat panel and waiting for a text response — there's no way to get fast, visual answers directly on the map.

The agent has property DB tools but: (1) can't run aggregate SQL (COUNT, GROUP BY), (2) screening tools are broken (wrong endpoints), (3) no isochrone/drive-time capability, (4) no summary card UI for structured results, (5) Qdrant recall not wired into parcel lookups.

## Solution

Turn the map search bar into a natural language query interface. The agent generates SQL, runs screenings, computes isochrones, and emits map actions + summary cards as the response surface. "Continue in chat" transfers context for multi-turn investigation.

Architecture mirrors Google Maps AI Kit: agent has data tools (SQL) + visualization tools (map actions) + grounding (real DB, not hallucinated).

## Deliverables

### 1. Agent SQL Tool — `query_parcels_sql`

New agent tool that generates and executes SELECT queries against the property DB via the gateway's `/tools/parcels.sql` endpoint.

**System prompt grounding:** Inject the full `ebr_parcels` schema into the tool description so the LLM knows exact column names, types, and valid values.

Schema (from deployed property DB):
```
ebr_parcels: id, parcel_id, address, area_sqft, owner, assessed_value, zoning_type, geom, created_at
```

The tool:
- Accepts a `sql` string parameter (SELECT only)
- Validates it starts with SELECT (defense in depth — gateway also enforces)
- Calls `gatewayPost("/tools/parcels.sql", { sql })`
- Returns rows + wraps with `__mapFeatures` for map visualization
- Supports COUNT, GROUP BY, ORDER BY, LIMIT, WHERE with any SQL operators
- Supports PostGIS spatial functions (ST_Within, ST_DWithin, ST_Area, etc.)

**Files:**
- Modify: `packages/openai/src/tools/propertyDbTools.ts` — add `query_parcels_sql` tool
- Modify: `packages/openai/src/agents/index.ts` — register tool with coordinator

### 2. Isochrone Tool — `compute_drive_time_area`

New agent tool wrapping Google Routes API to compute drive-time polygons.

- Accepts: origin (lat/lng or address), travel time (minutes), mode (driving/walking)
- Calls Google Routes API / Distance Matrix to compute isochrone
- Returns GeoJSON polygon
- Emits `addLayer` map action to render the isochrone overlay
- Stores result in Qdrant for future queries (amortize API cost)

**Files:**
- Create: `packages/openai/src/tools/spatialTools.ts` — isochrone tool
- Modify: `packages/openai/src/agents/index.ts` — register tool

### 3. Summary Card Component

A map-docked card that renders structured query results. Supports:
- **Count card:** "3,412 parcels zoned C2 | 8,741 total acres"
- **Parcel detail card:** Full dossier with screening results
- **Table card:** Ranked list of parcels with columns
- **Comparison card:** Side-by-side parcel comparison

The agent returns structured data via SSE events; the map page renders the appropriate card type.

**Files:**
- Create: `apps/web/components/maps/MapResultCard.tsx` — polymorphic result card
- Modify: `apps/web/app/map/page.tsx` — render cards from agent responses

### 4. Smart Search Bar

Transform the existing map search bar into a unified NL input:
- If input looks like a parcel ID or address → existing fast-path suggest
- Otherwise → route to agent via `/api/chat` with map context
- Show loading state while agent processes
- Results appear as summary card + map highlights (not chat bubbles)
- "Continue in chat" button opens MapChatPanel with full context

**Files:**
- Modify: `apps/web/app/map/page.tsx` — search bar routing logic
- Modify: `apps/web/components/maps/MapChatPanel.tsx` — accept transferred context

### 5. Fix Screening Tools

The screening tools in `propertyDbTools.ts` currently call non-existent endpoints. Fix to call correct gateway paths (`/tools/screen.*`).

**Files:**
- Modify: `packages/openai/src/tools/propertyDbTools.ts` — fix endpoint paths

### 6. Wire Qdrant Recall

When the agent looks up a parcel, also query Qdrant for stored intelligence (prior analysis, notes, deal history). Include in the response.

**Files:**
- Modify: `packages/openai/src/tools/propertyMemoryTools.ts` — ensure recall_property_intelligence is wired
- Modify coordinator system prompt to instruct recall on parcel lookups

### 7. Map Action Emission

Ensure the agent can emit map actions (highlight, flyTo, addLayer) as part of tool responses. The existing `__mapFeatures` envelope handles highlight/flyTo. Add support for `addLayer` (isochrone polygons, result set boundaries).

**Files:**
- Modify: `packages/openai/src/tools/propertyDbTools.ts` — emit map actions from SQL results
- Modify: `apps/web/lib/chat/mapActionTypes.ts` — if new action types needed

## Architecture

```
Search Bar (NL input)
    │
    ▼
/api/chat (SSE stream)
    │
    ├─► ParcelQueryPlanner (intent classification)
    │
    ▼
Agent Coordinator
    │
    ├─► query_parcels_sql → gateway /tools/parcels.sql → rows
    ├─► compute_drive_time_area → Google Routes API → isochrone GeoJSON
    ├─► screen_* tools → gateway /tools/screen.* → screening data
    ├─► recall_property_intelligence → Qdrant → stored findings
    │
    ▼
SSE Response Stream
    │
    ├─► Map actions (highlight, flyTo, addLayer)
    ├─► Summary card data (structured JSON)
    └─► Text narrative (agent synthesis)
    │
    ▼
Map Page
    ├─► MapLibreParcelMap (renders highlights, layers, fly-to)
    ├─► MapResultCard (renders summary cards)
    └─► "Continue in chat" → MapChatPanel (transfers context)
```

## Phased Rollout

**Phase 1 (Core Query):** query_parcels_sql tool + fix screening endpoints + summary card component + smart search bar routing. This enables examples 1 and 2.

**Phase 2 (Spatial):** compute_drive_time_area tool + isochrone rendering + Qdrant storage. This enables example 3.

**Phase 3 (Polish):** Comparison cards, batch screening, "Continue in chat" handoff, Qdrant recall on every parcel lookup.
