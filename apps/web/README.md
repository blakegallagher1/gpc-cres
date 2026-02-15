# GPC Agent Orchestration Dashboard

AI Agent Orchestration Dashboard for Gallagher Property Company - Commercial Real Estate Development.

## Features

- **8 Specialized Agents**: Coordinator, Market Research, Financial Analyst, Legal Review, Design Advisor, Operations, Marketing, Risk Manager
- **Visual Workflow Builder**: Drag-and-drop workflow creation with React Flow
- **Run Observability**: Full trace visualization with timeline view
- **Multi-Channel Deployment**: Web forms, chat widgets, REST API, Slack, WhatsApp
- **Real-time Monitoring**: Live run status, token usage, cost tracking

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand
- **Database**: Supabase (PostgreSQL)
- **Workflows**: @xyflow/react (React Flow)

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo>
cd gpc-dashboard
npm install
```

### 2. Set Up Environment Variables

Create `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# OpenAI
OPENAI_API_KEY=sk-your-key

# Screening/automation backend (copilot, screening, deal-room workflows)
NEXT_PUBLIC_BACKEND_URL=http://localhost:8000

# Optional: Perplexity for research agent
PERPLEXITY_API_KEY=your-key
```

### 3. Set Up Database

1. Go to [Supabase](https://supabase.com) and create a new project
2. Open the SQL Editor
3. Copy the contents of `supabase_schema.sql`
4. Run the SQL to create all tables and seed data

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Project Structure

```
gpc-dashboard/
├── app/                    # Next.js App Router
│   ├── api/               # API routes (serverless functions)
│   │   ├── agents/        # Agent API endpoints
│   │   ├── workflows/     # Workflow API endpoints
│   │   └── runs/          # Run/trace API endpoints
│   ├── agents/            # Agent Library page
│   ├── workflows/         # Workflow Builder page
│   ├── runs/              # Run History page
│   ├── deploy/            # Deployment channels page
│   ├── settings/          # Settings page
│   ├── page.tsx           # Dashboard home
│   └── layout.tsx         # Root layout
├── components/
│   ├── layout/            # Sidebar, Header, DashboardShell
│   ├── ui/                # shadcn/ui components
│   └── providers/         # Theme provider
├── lib/
│   ├── data/              # Static data (agents)
│   ├── db/                # Database utilities
│   └── utils.ts           # Utility functions
├── stores/                # Zustand stores
├── types/                 # TypeScript types
└── supabase_schema.sql    # Database schema
```

## API Routes

| Route | Method | Description |
|-------|--------|-------------|
| `/api/agents` | GET | List all agents |
| `/api/agents` | POST | Create new agent |
| `/api/agents/[id]` | GET | Get agent details |
| `/api/agents/[id]` | PUT | Update agent |
| `/api/agents/[id]` | DELETE | Delete agent |
| `/api/agents/[id]/run` | POST | Run agent |
| `/api/workflows` | GET | List workflows |
| `/api/workflows` | POST | Create workflow |
| `/api/workflows/[id]` | GET | Get workflow |
| `/api/workflows/[id]` | PUT | Update workflow |
| `/api/workflows/[id]/run` | POST | Run workflow |
| `/api/runs` | GET | List runs |
| `/api/runs` | POST | Create run |
| `/api/runs/[id]` | GET | Get run details |
| `/api/runs/[id]/trace` | GET | Get run trace |

## Deployment

### Vercel (Recommended)

```bash
npm install -g vercel
vercel
```

### Environment Variables on Vercel

Add these in your Vercel project settings:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_BACKEND_URL`

## Development

### Adding a New Agent

1. Add agent to `lib/data/agents.ts`
2. Create agent implementation in `lib/agents/`
3. Add API route if needed
4. Update UI components

### Adding a New Page

1. Create folder in `app/`
2. Add `page.tsx` with your component
3. Update `Sidebar.tsx` navigation
4. Add API routes if needed

## License

Private - Gallagher Property Company
