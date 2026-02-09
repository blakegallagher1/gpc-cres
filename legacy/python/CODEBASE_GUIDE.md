# Gallagher Cres - Codebase Guide

This folder contains the complete codebase for the Gallagher Property Company AI Agent Dashboard.

## Folder Structure

```
gallagher-cres/
├── frontend/                  # Next.js 15 Dashboard (UI)
│   ├── app/                   # Next.js App Router pages
│   │   ├── agents/            # Agent Library & Detail pages
│   │   ├── api/               # API routes
│   │   ├── deploy/            # Deployment Channels page
│   │   ├── runs/              # Run History & Trace pages
│   │   ├── workflows/         # Workflow Builder & List pages
│   │   ├── globals.css        # Global styles
│   │   ├── layout.tsx         # Root layout
│   │   └── page.tsx           # Dashboard home
│   ├── components/            # React components
│   │   ├── command-palette/   # Cmd+K search
│   │   ├── error-boundary/    # Error handling
│   │   ├── layout/            # Shell, Header, Sidebar
│   │   ├── skeletons/         # Loading states
│   │   ├── transitions/       # Page animations
│   │   ├── ui/                # shadcn/ui components
│   │   └── workflows/         # Workflow nodes
│   ├── lib/                   # Utilities & hooks
│   │   ├── data/              # Mock data (agents, workflows)
│   │   ├── hooks/             # Custom React hooks
│   │   ├── utils.ts           # Utility functions
│   │   └── workflow-io.ts     # Import/export workflows
│   ├── __tests__/             # Unit tests (Jest)
│   ├── e2e/                   # E2E tests (Playwright)
│   ├── types/                 # TypeScript types
│   └── stores/                # Zustand state stores
│
├── agents/                    # Python agent definitions (8 agents)
├── config/                    # Configuration files
├── database/                  # Database schema & migrations
├── examples/                  # Usage examples
├── models/                    # Pydantic models
├── prompts/                   # Agent system prompts
├── tests/                     # Python tests
├── tools/                     # Agent tools
├── workflows/                 # Workflow definitions
│
├── main.py                    # FastAPI entry point
├── docker-compose.yml         # Docker setup
├── Dockerfile                 # Backend container
├── pyproject.toml             # Python dependencies
├── requirements.txt           # Pip dependencies
├── Makefile                   # Build commands
│
├── README.md                  # Project overview
├── PROJECT_SUMMARY.md         # Architecture summary
├── IMPLEMENTATION_NOTES.md    # Development notes
├── Implementation_Checklist.md # Feature checklist
└── CODEBASE_GUIDE.md          # This file
```

## What to Download

### Option 1: Download Everything (Recommended)
Download the entire `gallagher-cres` folder. This includes:
- ✅ Complete Next.js frontend (100% complete)
- ✅ Python backend structure (partial)
- ✅ All documentation
- ✅ Database schema
- ✅ Tests

### Option 2: Frontend Only
Download just the `frontend/` folder if you only need the UI:
```
frontend/
├── app/
├── components/
├── lib/
├── __tests__/
├── e2e/
├── types/
├── stores/
├── package.json
├── next.config.ts
├── tailwind.config.ts
└── tsconfig.json
```

### Option 3: Backend Only
Download everything except the `frontend/` folder if you only need the Python backend:
```
agents/
config/
database/
examples/
models/
prompts/
tests/
tools/
workflows/
main.py
docker-compose.yml
Dockerfile
pyproject.toml
requirements.txt
```

## Quick Start

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Backend
```bash
# Using Docker
docker-compose up

# Or locally
pip install -r requirements.txt
python main.py
```

## Key Files

| File | Purpose |
|------|---------|
| `frontend/app/page.tsx` | Dashboard homepage |
| `frontend/lib/data/agents.ts` | 8 agent definitions |
| `frontend/lib/hooks/useRealtime.ts` | Real-time updates hook |
| `frontend/lib/hooks/useUndoRedo.ts` | Undo/redo functionality |
| `database/schema.sql` | Supabase schema |
| `main.py` | FastAPI application |
| `agents/` | Python agent implementations |
| `Implementation_Checklist.md` | Complete feature checklist |

## Documentation

- **README.md** - Project overview and setup
- **PROJECT_SUMMARY.md** - Architecture and design decisions
- **IMPLEMENTATION_NOTES.md** - Development notes
- **Implementation_Checklist.md** - Complete checklist (Phases 1-14)
- **ROADMAP_REMAINING_FEATURES.md** - 10-week roadmap (in frontend/)
- **REALTIME_ADVANCED_FEATURES.md** - Real-time features docs (in frontend/)

## Status

| Component | Status |
|-----------|--------|
| Frontend UI | 100% Complete |
| Real-time Features | 100% Complete |
| Advanced Features | 100% Complete |
| Testing | 100% Complete |
| Python Backend | Structure ready |
| Supabase Integration | Pending |
| Authentication | Pending |
| Production Deployment | Pending |

---

*Last Updated: January 2026*
