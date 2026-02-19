# Real-time Features & Advanced Features Implementation

Last reviewed: 2026-02-19


## Overview

This document describes the real-time features, advanced features, polish, and testing that have been implemented for the GPC Dashboard.

---

## Real-time Features

### 1. WebSocket-like Live Updates (`lib/hooks/useRealtime.ts`)

The `useRealtime` hook provides real-time updates with the following features:

- **Simulated WebSocket connection** for demo purposes (easily replaceable with real WebSocket)
- **Toast notifications** for run events (started, completed, failed)
- **Metric updates** for dashboard stats
- **Configurable callbacks** for each event type

```typescript
const { isConnected } = useRealtime({
  onRunStarted: (data) => { /* handle run start */ },
  onRunCompleted: (data) => { /* handle run complete */ },
  onRunFailed: (data) => { /* handle run failure */ },
  onMetricUpdate: (data) => { /* handle metric update */ },
  enableNotifications: true,
});
```

### 2. Auto-refresh Hook (`useAutoRefresh`)

Automatically refreshes data at specified intervals:

```typescript
const { isRefreshing, lastRefresh, refresh } = useAutoRefresh(
  fetchDashboardData,
  30000 // 30 seconds
);
```

### 3. Run Status Polling (`useRunStatus`)

Polls run status until completion:

```typescript
const { status, isPolling } = useRunStatus(runId, (newStatus) => {
  // Handle status change
});
```

### 4. Dashboard Integration

The Dashboard page now includes:
- **Connection status indicator** (Live/Offline)
- **Last refresh timestamp**
- **Manual refresh button**
- **Dynamic stat updates**
- **Live run list updates**

---

## Advanced Features

### 1. Undo/Redo System (`lib/hooks/useUndoRedo.ts`)

Full undo/redo functionality with:

- **Configurable history limit** (default: 50 states)
- **Keyboard shortcuts** (Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z)
- **Functional state updates** support
- **onChange callback** for side effects
- **Reset functionality**

```typescript
const { state, setState, undo, redo, canUndo, canRedo } = useUndoRedo(
  initialState,
  { maxHistory: 100, onChange: (state) => console.log(state) }
);
```

### 2. Workflow Import/Export (`lib/workflow-io.ts`)

Complete workflow serialization:

- **Export to JSON** with metadata
- **Import from JSON** with validation
- **Download as file** with proper naming
- **Error handling** with user-friendly messages

```typescript
// Export
const json = exportWorkflow(workflow);
downloadWorkflow(workflow);

// Import
const result = importWorkflow(jsonString);
if (result.success) {
  // Use result.workflow
}
```

### 3. Workflow Templates

Pre-built workflow templates:

- **Blank Workflow** - Start from scratch
- **Property Analysis Pipeline** - Research → Finance + Legal
- **Development Review** - Design + Ops → Risk → End

```typescript
import { workflowTemplates } from "@/lib/workflow-io";
```

### 4. Command Palette (`components/command-palette/CommandPalette.tsx`)

Global command interface with:

- **Keyboard shortcut** (Cmd/Ctrl + K)
- **Navigation commands** (G + letter)
- **Agent quick access**
- **Theme toggle**
- **Search functionality**

**Navigation Shortcuts:**
- `G D` - Go to Dashboard
- `G A` - Go to Agent Library
- `G W` - Go to Workflows
- `G R` - Go to Run History
- `G P` - Go to Deploy
- `G S` - Go to Settings

---

## Polish Features

### 1. Loading Skeletons

**Dashboard Skeleton** (`components/skeletons/DashboardSkeleton.tsx`)
- Stats cards
- Activity chart
- Recent runs
- Agent status

**Table Skeleton** (`components/skeletons/TableSkeleton.tsx`)
- Configurable rows/columns
- Header toolbar
- Action buttons

### 2. Error Boundaries

**Page-level Error Boundary** (`components/error-boundary/ErrorBoundary.tsx`)
- Catches uncaught errors
- Shows friendly error message
- Retry button
- Go home button

**Section-level Error Boundary** (`SectionErrorBoundary`)
- Granular error handling
- Per-section retry
- Non-blocking

### 3. Page Transitions

**PageTransition** (`components/transitions/PageTransition.tsx`)
- Smooth fade-in/fade-out
- Directional slide animation
- AnimatePresence for exit animations

**StaggerContainer & StaggerItem**
- Staggered child animations
- Configurable delay

**FadeIn**
- Simple fade animation
- Configurable delay

**ScaleOnHover**
- Interactive hover effects
- Configurable scale amount

---

## Testing

### 1. Unit Tests (Jest + React Testing Library)

**Test Setup** (`__tests__/setup.ts`)
- Mocks for next/navigation
- Mocks for next-themes
- Mocks for sonner toast
- Mock for matchMedia
- Mock for IntersectionObserver
- Mock for ResizeObserver

**useUndoRedo Tests** (`__tests__/hooks/useUndoRedo.test.ts`)
- Initialization
- State updates
- Undo functionality
- Redo functionality
- History clearing
- Functional updates
- Reset functionality
- Max history limit
- onChange callback

**workflow-io Tests** (`__tests__/lib/workflow-io.test.ts`)
- Export workflow
- Import valid workflow
- Import invalid JSON
- Missing workflow data
- Invalid nodes array
- Invalid edges array
- Invalid node structure
- Invalid edge structure
- Template validation

### 2. E2E Tests (Playwright)

**Configuration** (`playwright.config.ts`)
- Cross-browser testing (Chrome, Firefox, Safari)
- Mobile testing (Pixel 5, iPhone 12)
- Screenshot on failure
- Video on first retry

**Navigation Tests** (`e2e/navigation.spec.ts`)
- Dashboard display
- Navigate to Agent Library
- Navigate to Workflows
- Navigate to Run History
- Navigate to Deploy
- Navigate to Settings
- Command palette keyboard shortcut
- Command palette navigation

**Agent Tests** (`e2e/agents.spec.ts`)
- Display all agents
- Filter by search
- Filter by capability
- Navigate to agent detail
- Run agent from detail

**Workflow Tests** (`e2e/workflows.spec.ts`)
- Display workflows list
- Navigate to workflow builder
- Display builder canvas
- Show validation errors
- Display workflow details
- Run workflow

---

## File Summary

### New Files Created

```
lib/hooks/
├── useRealtime.ts          # Real-time updates, auto-refresh, polling
└── useUndoRedo.ts          # Undo/redo functionality

lib/
└── workflow-io.ts          # Import/export, templates

components/command-palette/
└── CommandPalette.tsx      # Global command interface

components/error-boundary/
└── ErrorBoundary.tsx       # Error handling

components/skeletons/
├── DashboardSkeleton.tsx   # Dashboard loading state
└── TableSkeleton.tsx       # Table loading state

components/transitions/
└── PageTransition.tsx      # Page animations

__tests__/
├── setup.ts                # Test configuration
├── hooks/
│   └── useUndoRedo.test.ts # Undo/redo tests
└── lib/
    └── workflow-io.test.ts # Workflow I/O tests

e2e/
├── navigation.spec.ts      # Navigation E2E tests
├── agents.spec.ts          # Agent E2E tests
└── workflows.spec.ts       # Workflow E2E tests

playwright.config.ts        # Playwright configuration
```

### Updated Files

```
app/page.tsx                # Added real-time features
components/layout/
└── DashboardShell.tsx      # Added Command Palette
```

---

## Usage Examples

### Using Real-time Features in a Component

```typescript
"use client";

import { useRealtime, useAutoRefresh } from "@/lib/hooks/useRealtime";

export function MyComponent() {
  const fetchData = async () => {
    // Fetch your data
  };

  // Real-time updates
  const { isConnected } = useRealtime({
    onRunCompleted: (data) => {
      console.log("Run completed:", data);
    },
  });

  // Auto-refresh every 30 seconds
  const { isRefreshing } = useAutoRefresh(fetchData, 30000);

  return (
    <div>
      {isConnected ? "Live" : "Offline"}
      {isRefreshing && "Refreshing..."}
    </div>
  );
}
```

### Using Undo/Redo in Workflow Builder

```typescript
import { useWorkflowHistory } from "@/lib/hooks/useUndoRedo";

export function WorkflowBuilder() {
  const { state, setState, undo, redo, canUndo, canRedo } = useWorkflowHistory({
    nodes: [],
    edges: [],
  });

  const addNode = (node) => {
    setState((prev) => ({
      ...prev,
      nodes: [...prev.nodes, node],
    }));
  };

  return (
    <div>
      <button onClick={undo} disabled={!canUndo}>Undo</button>
      <button onClick={redo} disabled={!canRedo}>Redo</button>
    </div>
  );
}
```

### Using Error Boundary

```typescript
import { ErrorBoundary } from "@/components/error-boundary/ErrorBoundary";

export function MyPage() {
  return (
    <ErrorBoundary>
      <MyComponent />
    </ErrorBoundary>
  );
}
```

### Using Page Transitions

```typescript
import { PageTransition, FadeIn } from "@/components/transitions/PageTransition";

export function MyPage() {
  return (
    <PageTransition>
      <FadeIn delay={0.1}>
        <h1>Title</h1>
      </FadeIn>
      <FadeIn delay={0.2}>
        <p>Content</p>
      </FadeIn>
    </PageTransition>
  );
}
```

---

## Next Steps

1. **Connect to Real Backend**
   - Replace simulated WebSocket with real connection
   - Connect Supabase for data persistence
   - Implement actual API routes

2. **Authentication**
   - Add Supabase Auth
   - Protect routes
   - User preferences

3. **Performance**
   - React Server Components
   - Data caching
   - Bundle optimization

---

*Last Updated: January 2026*
