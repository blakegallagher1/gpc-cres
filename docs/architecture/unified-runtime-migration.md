# Unified Runtime Migration Analysis

**Date:** 2026-03-27
**Status:** Design / Future Planning
**Timeline:** Q3-Q4 2026 evaluation

## Current Architecture

| Component | Stack | Location | Purpose |
|-----------|-------|----------|---------|
| CUA Worker | Node.js + Playwright + Chromium | Windows Docker (gpc-cua-worker) | Browser automation via OpenAI computer use |
| Gateway | FastAPI + Martin tiles | Windows Docker (gateway:8000) | Property data proxy + tile serving |
| Property DB | PostgreSQL + PostGIS | Windows Docker (172.18.x network) | 560K parcels + screening (flood, soils, wetlands, EPA) |
| App DB | PostgreSQL + Prisma | Windows Docker (172.19.x network) | Deal pipeline, conversations, automation events |
| Vector Store | Qdrant | Windows Docker (172.19.x network) | Property intelligence embeddings (1536-dim dense + BM25 sparse) |
| Agent Runtime | @openai/agents TS SDK | Vercel (serverless) | 14-agent coordinator + specialists, chat SSE |
| Frontend | Next.js | Vercel | Chat UI, deal pipeline, map |
| Auth Gateway | Cloudflare | Edge | Tunnel, Workers, Access, Hyperdrive |

## Architectural Constraints (Non-Negotiable)

### Data Sovereignty
- **Property DB** (560K parcels, PostGIS): Must remain on-premises. Contains GPC's proprietary multi-parish dataset.
- **App DB** (Prisma): Can remain on-premises via CF tunnel. Contains deal and automation data.
- **Qdrant**: Custom embedding pipeline. Must remain on-premises for operational security.

### Browser Automation
- **CUA Worker** requires Playwright + Chromium for real browser interactions.
- Custom first-party auth bootstrap (`first-party-auth.ts`) handles GPC session token injection.
- OpenAI `computer` tool is native but lacks custom auth flow — CUA worker provides the bridge.

### Agent Runtime
- Current: @openai/agents SDK on Vercel (serverless, 10s cold start).
- Hosted OpenAI containers would add ~1-2s cold start but remove Vercel dependency.
- Trade-off: Architectural simplicity (keep Vercel) vs. vendor consolidation (move to hosted containers).

---

## OpenAI Native Equivalents & Migration Feasibility

| Current Component | OpenAI Native Option | Feasibility | Notes |
|-------------------|----------------------|-------------|-------|
| CUA Worker (Playwright) | `computer` tool (already in use) | **Keep custom** | Native tool lacks custom auth bootstrap; custom worker is specialized for GPC needs |
| Gateway data queries | Shell tool + `container_auto` | **Medium** | Simple HTTP-RPC queries could migrate; requires persistent DB connections in container |
| Report generation | Shell tool + skills + `/mnt/data` | **High** | Parish packs, triage PDFs fit naturally; write to disk, retrieve via Files API |
| Screening scripts | Shell tool + `domain_secrets` | **High** | Stateless batch screening aggregation; no auth complexity |
| Property DB access | N/A | **Keep on-premises** | 560K parcels + PostGIS; data sovereignty non-negotiable |
| Qdrant vector search | N/A | **Keep on-premises** | Custom 1536-dim embeddings; no equivalent in hosted containers |
| Prisma ORM | N/A | **Keep current path** | CF tunnel + Hyperdrive optimal for serverless agents |
| First-party auth | N/A (domain_secrets partial) | **Keep custom** | CUA worker bootstrap is GPC-specific; domain_secrets doesn't support session cookies |

---

## Hybrid Approach: Recommended Strategy

### Phase 1: Skills Adoption (✅ Completed — P1)
- **Status**: 4 skill bundles created (screening, parish-pack, deal-enrichment, cua-playbook)
- **Evidence**: Skills visible in `/skills/` directory with SKILL.md definitions
- **Next step**: Upload skills to OpenAI Skills API for hosted environment testing

### Phase 2: Hosted Shell for Reports (Q3 2026 Candidate)

**Scope**: Move report/artifact generation from Vercel agents to OpenAI hosted containers.

**Rationale**:
- Parish pack generation (parish.ts agent) involves CPU-intensive PDF manipulation, not latency-sensitive operations
- Current flow: agent → write artifacts to D1 → retrieve via Files API; hosted shell writes to `/mnt/data` instead
- No custom auth needed — domain_secrets for gateway API token is sufficient

**Implementation**:
1. Move parish pack script to hosted shell (skill + domain_secrets for `GATEWAY_PROXY_TOKEN`)
2. Write PDFs to `/mnt/data`, poll `/files` endpoint
3. Benchmark latency: Vercel agent (current) vs. hosted shell (proposed)
4. If latency acceptable and cost lower, expand to other report generators

**Risk**: Hosted shell performance (cold start, container warm-up) unproven in production at scale.

### Phase 3: Agent Runtime Evaluation (Q1 2027)

**Decision point**: Evaluate full agent migration to hosted OpenAI runtime.

**Prerequisites**:
- Phase 2 benchmarks complete
- OpenAI hosted container performance stabilized in public API
- Skills SDK fully featured in TypeScript (as of 2026-03, still evolving)

**Go/No-go Criteria**:
- Cold start latency < 2s (target: <1s for competitive advantage)
- Network policy supports GPC domains (gateway, Qdrant, DB tunnel)
- Cost per container-hour ≤ $0.02 (Vercel baseline ~$0.018)
- Skills SDK supports all required tool types (shell, files, vision, etc.)

**If GO**: Migrate coordinator to hosted containers, keep Vercel for frontend only.
**If NO-GO**: Stick with hybrid approach; Vercel agents + custom workers remain optimal.

### Phase 4: Data Pipeline Migration (2027+, Speculative)

**Long-term vision**: If hosted containers gain persistent PostgreSQL support, move gateway replacement to containers.

**Currently not viable**: Hosted containers lack persistent connection pooling for Property DB queries.

---

## Component-by-Component Analysis

### CUA Worker: Browser Automation

**Current State**:
- Custom Node.js + Playwright + Chromium container on Windows
- Provides OpenAI-compatible `/tasks` API wrapping native `computer` tool
- Adds custom first-party auth bootstrap for GPC login flows

**Migration Option**: Replace with native OpenAI `computer` tool
- **Pros**: Single vendor, no custom infrastructure
- **Cons**: Loss of custom auth flow; would need to patch OpenAI SDK to support session cookies
- **Recommendation**: **Keep custom**. The auth bootstrap (`first-party-auth.ts`) is GPC-specific and provides critical value. Migration cost (rewrite first-party auth in OpenAI SDK) > benefit.

---

### Gateway: FastAPI + Property Data Proxy

**Current State**:
- FastAPI server proxying to Property DB (172.18.x network)
- Handles `/tools/parcels.sql`, `/screening/*` endpoints
- Serves Martin tile layers for map

**Migration Option 1**: Shell tool in hosted containers
- POST shell script: `curl -H "Authorization: Bearer TOKEN" https://api.gallagherpropco.com/tools/parcels.sql -d '...'`
- **Pros**: Reduces on-premises infrastructure footprint
- **Cons**: Each container invocation = cold HTTP client; no persistent connection pool; adds 200-500ms latency
- **Recommendation**: **Medium priority**. Possible in Phase 2, but only after latency benchmarking.

**Migration Option 2**: Martin tile migration
- Move to Cloudflare Workers / edge compute
- **Pros**: Better CDN perf, edge caching
- **Cons**: Complex to replicate all tile generation logic; Martin is well-optimized in current location
- **Recommendation**: **Defer to 2027**. Current setup is performant; prioritize higher-value migrations first.

---

### Report Generation (Parish Packs, Triage PDFs)

**Current State**:
- `parish.ts` agent generates parish packs (PDF artifacts)
- Runs on Vercel (serverless); writes to D1 cache, then served via Files API
- Uses Tesseract.js for OCR, html2pdf for rendering

**Migration Option**: Hosted shell with `/mnt/data`
- Move parish pack script to shell tool within hosted container
- Write PDF to `/mnt/data`, retrieve via Files API
- All current dependencies (Tesseract.js, html2pdf) available in Node.js

**Pros**:
- Removes serverless cold start penalty for long-running reports
- Potential cost savings (hosted containers billed by execution time, not function invocation)
- Consolidates agent runtime (fewer vendor touch points)

**Cons**:
- Hosted container cold start (1-2s) may offset serverless penalty if report is small
- Requires benchmarking before commitment

**Recommendation**: **High priority for Phase 2**. Pilot with parish pack generation; measure latency, cost, reliability. If successful, expand to other artifact generators.

---

### Screening & Data Processing

**Current State**:
- Batch screening tool (`screen_batch`) aggregates flood/soil/wetlands/EPA data
- Runs on Vercel agents; calls gateway endpoints

**Migration Option**: Shell tool with domain_secrets
- Move batch screening script to hosted shell
- Use domain_secrets for `GATEWAY_PROXY_TOKEN` auth
- Stateless execution — no persistent DB needed

**Pros**:
- Natural fit for shell execution (CPU-bound data aggregation)
- No auth complexity (gateway API token in domain_secrets)
- Opportunity to parallelize screening across containers

**Cons**:
- Hosted shell execution time billed per second (vs. Vercel's function invocation model)
- Batch operations (20+ parcels) may be more cost-effective on Vercel

**Recommendation**: **Medium priority for Phase 2**. Candidate for migration if benchmarks show cost parity; otherwise keep on Vercel.

---

### Property & Vector Databases

**Cannot Migrate** — data sovereignty non-negotiable.

- Property DB (560K parcels, PostGIS geospatial) must stay on Windows server.
- Qdrant (custom embeddings, 1536-dim dense + BM25 sparse) must stay on-premises.
- Both accessible via gateway API (Property DB) and internal Docker network (Qdrant).

**Integration Path**: Keep current architecture; hosted agents call via API/tunnel.

---

## Risk Assessment & Mitigation

| Risk | Severity | Current Mitigation | Future Action |
|------|----------|-------------------|----------------|
| **Platform lock-in** | High | Use MCP servers; interfaces SDK-agnostic | Maintain SDK abstraction; avoid OpenAI-specific syntax |
| **Latency regression** | Medium | Benchmark Phase 2 before Phase 3 commitment | Set SLO thresholds (parish pack <15s, screening <5s) |
| **Cold start penalty** | Medium | Phase 2 pilots measure cold start | Evaluate container warm pools or reserved capacity |
| **Cost increase** | Medium | Detailed cost model for hosted vs. Vercel | Pilot with <5% of traffic before full migration |
| **Data sovereignty** | High | Keep Property DB & Qdrant on-premises | Never migrate; only extend via API |
| **Feature gaps** | Medium | Skills SDK evolving; may not support all tools | Evaluate quarterly; defer Phase 3 if SDK lags |
| **Network policy** | Medium | Hosted containers must reach GPC domains | Test DNS, domain_secrets, external HTTPS in Phase 1 pilot |
| **Authentication** | High | Custom CUA worker for first-party auth | Keep worker; invest in hardening if needed |

---

## Migration Phases: Detailed Timeline

### Phase 1: Skills Adoption (Completed Q1 2026)

**Deliverables**:
- ✅ 4 skill bundles (screening, parish-pack, deal-enrichment, cua-playbook)
- ✅ Skill definitions in `/skills/` with SKILL.md
- ✅ Inline skill builder for dynamic playbooks
- **Deferred:** Upload to OpenAI Skills API and hosted-shell integration remain deferred until they are promoted into `ROADMAP.md` as active work.

**Timeline**: Q1 2026 ✅ → Q2 2026 (API upload & integration testing)

**Success Criteria**:
- Skills API integration working in production
- At least one skill (screening) callable from hosted container shell
- Latency < 10% slower than current Vercel execution

---

### Phase 2: Hosted Shell for Reports (Q3 2026 Target)

**Deliverables**:
- Pilot: Parish pack generation in hosted shell
- Benchmark: Vercel agent vs. hosted shell (latency, cost, cold start)
- Decision: Expand to other generators or revert to Vercel

**Key Milestones**:
1. **Week 1-2**: Containerize parish pack script; test locally with `/mnt/data`
2. **Week 3-4**: Deploy pilot; run 100 jobs to collect baseline metrics
3. **Week 5**: Analyze costs, latency, reliability; decide on full migration
4. **Week 6+**: If GO, migrate screening & triage PDF generation

**Success Criteria**:
- Parish pack execution < 15s (current: ~12s on Vercel)
- Cost per job < current Vercel estimate ($0.005-0.01 per invocation)
- Error rate < 0.1% (zero regressions from current state)

---

### Phase 3: Evaluate Full Agent Runtime (Q1 2027)

**Deliverables**:
- Performance benchmarks: hosted coordinator vs. Vercel agents
- Cost model: all-in comparison (containers + storage + network)
- Decision: commit to hosted runtime or maintain hybrid approach

**Decision Criteria**:
- Cold start latency < 2s (targeting <1s for competitive advantage)
- Network policy supports all required domains (gateway, Qdrant tunnel, Hyperdrive)
- Cost per container-hour ≤ $0.02
- Skills SDK supports all required tool types (shell, files, vision, knowledge store)
- Reliability metrics match or exceed Vercel baseline (99.95% uptime)

**Go/No-Go Process**:
1. Gather 30+ days of production metrics from Phase 2
2. Model cost + latency for full coordinator in hosted runtime
3. Compare to Vercel baseline + projected growth
4. Executive decision: migrate (Phase 3A) or maintain hybrid (Phase 3B)

---

### Phase 4: Data Pipeline Migration (2027+, Speculative)

**Only viable if**: OpenAI hosted containers gain persistent PostgreSQL connection support.

**Current Blocker**: Hosted containers restart frequently; persistent pools not yet available.

**Vision**: Consolidate gateway behind hosted shell, reduce Windows server footprint.

**Timeline**: 2027-Q2 at earliest; requires OpenAI infrastructure changes.

---

## Decision Framework

### When to Migrate (Phase 2+)

**Migrate to hosted shell if**:
- Task is CPU-bound (reports, screening aggregation)
- Task is stateless (no persistent connections needed)
- Latency benchmark shows < 5% penalty
- Cost model shows 10%+ savings over Vercel
- Reliability matches or exceeds current baseline

**Keep on Vercel if**:
- Task requires persistent auth or state
- Latency-sensitive (chat streaming, real-time map updates)
- Cost model shows no clear savings
- Task has complex error handling requiring immediate retry

### When NOT to Migrate

**Never migrate**:
- Property DB access (data sovereignty)
- Qdrant queries (custom embeddings, operational security)
- CUA worker (first-party auth bootstrap is GPC-specific)
- Chat streaming (Vercel SSE is optimized; hosted containers would add latency)

---

## Cost Comparison (Preliminary)

### Current (Vercel + Windows Server)

| Component | Cost / Month | Notes |
|-----------|--------------|-------|
| Vercel Pro | ~$20 | 14 agents, chat API, static assets |
| Vercel Edge Middleware | ~$10 | Gateway proxy, CUA tunnel routing |
| Windows Server (self-hosted) | ~$200 | Hardware + power (amortized) |
| Internet (business-class) | ~$100 | Redundancy + Cloudflare tunnel |
| **Total** | **~$330** | | |

### Proposed (Phase 2: Vercel + Hosted Shell + Windows Server)

| Component | Cost / Month | Notes |
|-----------|--------------|-------|
| Vercel Pro | ~$20 | Chat, coordinator, frontend |
| OpenAI Hosted Containers | ~$150 | 50K shell calls / month @ $0.0003 / 100ms |
| Windows Server (reduced) | ~$150 | Gateway + Qdrant only (CUA worker moves to OpenAI) |
| Internet (same) | ~$100 | |
| **Total** | **~$420** | 27% increase; breakeven if Vercel overages > $90 |

### Proposed (Phase 3: Full OpenAI Hosted)

| Component | Cost / Month | Notes |
|-----------|--------------|-------|
| OpenAI Hosted Runtime | ~$300 | 14 coordinator agents running constantly |
| Windows Server (minimal) | ~$80 | Property DB + Qdrant only |
| Internet (same) | ~$100 | |
| **Total** | **~$480** | 45% increase over current; justifies only if Vercel costs scale significantly |

---

## Implementation Checklist

### Phase 1: Skills API Upload (Q2 2026)

- [ ] Test each skill in OpenAI Skills SDK locally
- [ ] Upload to Skills API; verify callable from hosted shell
- [ ] Document integration in `/docs/skills/` directory
- [ ] Add skills to agent prompt for discovery
- [ ] Measure latency overhead vs. inline execution

### Phase 2: Hosted Shell Pilot (Q3 2026)

- [ ] Select parish pack generation as pilot workload
- [ ] Containerize script; test with `/mnt/data` locally
- [ ] Deploy to OpenAI hosted container beta
- [ ] Run 100 jobs; collect metrics (latency, cost, errors)
- [ ] Document results in migration decision log
- [ ] Go/no-go decision with product team

### Phase 3: Full Runtime Evaluation (Q1 2027)

- [ ] Extend Phase 2 metrics to full coordinator (14 agents)
- [ ] Model cost + latency for all workloads
- [ ] Benchmark reliability + uptime vs. Vercel
- [ ] Executive decision: commit or defer
- [ ] If commit: create Phase 3 implementation plan
- [ ] If defer: document blockers for future revisit

---

## FAQ & Known Issues

### Q: Why not migrate CUA worker to OpenAI native `computer` tool?
**A**: The native tool lacks support for custom auth flows (e.g., GPC session token injection). The custom worker adds a thin API wrapper that enables first-party authentication. Migrating would require rewriting auth logic in the OpenAI SDK, which is not maintainable long-term.

### Q: Why not move Property DB to cloud (Supabase, AWS RDS)?
**A**: Property DB contains 560K parcels and GPC's proprietary multi-parish geospatial data. Data sovereignty is non-negotiable. Keeping it on-premises provides operational control, cost stability, and compliance with GPC's data policy.

### Q: What about using OpenAI Assistants API instead of Agents SDK?
**A**: Assistants API is file-storage-focused and lacks the agent coordination features needed for 14-agent setup. Agents SDK (via Responses API) is the right tool for this architecture. Assistants API could be evaluated for simpler agents in Phase 4.

### Q: Can we use Cloudflare Workers for gateway replacement?
**A**: Workers have 50MB memory limit and 30s timeout. Property DB queries + screening aggregation exceed both. Workers are great for edge caching (Phase 2 candidate), but not for full gateway replacement.

### Q: What if OpenAI hosted containers shut down?
**A**: Risk is mitigated by maintaining MCP-style interfaces. If OpenAI containers become unavailable, Vercel agents can still reach all backends via APIs. The migration is additive, not substitutional (until Phase 3 full commitment).

---

## Conclusion

**Recommendation**: Pursue **Phase 2** (hosted shell for reports) in Q3 2026 as a low-risk pilot. Success criteria are clear and measurable. Phase 3 (full runtime migration) should be deferred to Q1 2027 pending Phase 2 results and OpenAI SDK maturity.

The hybrid approach (Vercel agents + custom workers + hosted shell for specific tasks) offers the best risk/reward balance in the near term. Data sovereignty and custom auth requirements make full consolidation on a single platform unlikely in 2026.
