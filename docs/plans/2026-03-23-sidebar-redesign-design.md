# Sidebar Redesign + Chat File Upload — Design Document

**Date:** 2026-03-23
**Status:** Approved for implementation

## Problem

The current 18-item sidebar in 6 groups is too flat. Every page sits at the same hierarchical level with no visual cue about daily workflow priority. Map and Prospecting are separate pages that both show parcels on a map. Chat file uploads only work when a deal is selected.

## Deliverables

### 1. Sidebar Restructure

Replace 6 groups / 18 items with 3 groups / 9 items + 1 pinned + 2 footer.

```
[pinned]   Chat              /chat              MessageSquare

OPERATE                                                        3 items
  Command Center           /command-center     LayoutDashboard  (HOME)
  Deals                    /deals              Briefcase
  Map                      /map                Map              (includes Prospecting)

INTELLIGENCE                                                   3 items
  Opportunities            /opportunities      Sparkles
  Market Intel             /market             BarChart3
  Portfolio                /portfolio          PieChart

SYSTEM                                                         3 items
  Agents & Runs            /agents             Bot
  Automation               /automation         Activity
  Reference Data           /reference          FileSearch

[footer]
  Settings                 /settings           Settings
  Admin                    /admin              Shield
```

Items removed from sidebar:
- Prospecting → becomes panel mode in Map
- Wealth → merged into Portfolio
- Runs → merged into Agents (tab/section)
- Permit Intel → already a sub-route of Market

Groups are collapsible with localStorage persistence.

### 2. Map + Prospecting Merge

The Prospecting filter panel and results table become a slide-out panel inside the Map page, alongside the existing MapChatPanel. A toolbar toggle switches between Chat panel and Prospecting panel. Only one panel visible at a time.

`/prospecting` route redirects to `/map?mode=prospecting`.

### 3. Chat File Upload Without Deal Requirement

Remove the `selectedDealId` guard on file uploads. When no deal is selected, upload to a general chat uploads endpoint. Extract file content and inject as agent context.

## Files Changed

### Sidebar (data changes):
- `apps/web/components/layout/workspaceRoutes.ts` — new group structure
- `apps/web/components/layout/Sidebar.tsx` — pinned item + footer rendering + collapsible groups

### Map + Prospecting merge:
- `apps/web/app/map/page.tsx` — add prospecting panel toggle
- New: `apps/web/components/map/MapProspectingPanel.tsx` — wraps ProspectFilters + ProspectResults
- `apps/web/app/prospecting/page.tsx` — replace with redirect

### Chat file upload:
- `apps/web/components/chat/ChatContainer.tsx` — remove deal guard
- New: `apps/web/app/api/chat/uploads/route.ts` — general upload endpoint
