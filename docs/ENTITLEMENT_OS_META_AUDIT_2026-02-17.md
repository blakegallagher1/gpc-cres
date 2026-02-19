# Entitlement OS Meta Prompt Audit (A1→G5)

Last reviewed: 2026-02-19


Date: 2026-02-17  
Scope baseline: `Entitlement_OS_Meta_Prompt.md`

## Final gate status

- `pnpm lint`: PASS
- `pnpm typecheck`: PASS
- `pnpm test`: PASS
- `pnpm build`: PASS

## Checklist status

Legend: `Done` / `Partial` / `Missing`

### Phase A — UI consolidation

- A1 `Done` — `/deploy` removed; sidebar entry removed  
  Evidence: `apps/web/components/layout/Sidebar.tsx`
- A2 `Done` — `/runs` History + Intelligence tabs; legacy dashboard redirect  
  Evidence: `apps/web/app/runs/page.tsx`, `apps/web/app/runs/dashboard/page.tsx`
- A3 `Done` — saved searches folded into prospecting  
  Evidence: `apps/web/app/prospecting/page.tsx`, `apps/web/app/saved-searches/page.tsx`
- A4 `Done` — workflows folded into automation Builder tab  
  Evidence: `apps/web/app/automation/page.tsx`, `apps/web/app/workflows/page.tsx`
- A5 `Done` — outcomes folded into portfolio tab  
  Evidence: `apps/web/app/portfolio/page.tsx`, `apps/web/app/outcomes/page.tsx`
- A6 `Done` — screening folded into deals triage queue and redirects  
  Evidence: `apps/web/app/deals/page.tsx`, `apps/web/app/screening/page.tsx`, `apps/web/app/screening/[projectId]/page.tsx`
- A7 `Done` — buyers folded into deal detail + portfolio cross-view  
  Evidence: `apps/web/app/deals/[id]/page.tsx`, `apps/web/app/portfolio/page.tsx`, `apps/web/app/buyers/page.tsx`
- A8 `Done` — `/reference` tabs replace evidence/jurisdictions routes  
  Evidence: `apps/web/app/reference/page.tsx`, `apps/web/app/evidence/page.tsx`, `apps/web/app/jurisdictions/page.tsx`
- A9 `Done` — deal room folded into deal detail tabs with redirect paths  
  Evidence: `apps/web/app/deals/[id]/page.tsx`, `apps/web/app/deal-room/[projectId]/page.tsx`
- A10 `Done` — final 12-item sidebar across 4 groups  
  Evidence: `apps/web/components/layout/Sidebar.tsx`

### Phase B — deal schema expansion

- B1 `Done` — DealTerms model + route + tests + UI  
  Evidence: `packages/db/prisma/schema.prisma`, `apps/web/app/api/deals/[id]/terms/route.ts`, `apps/web/app/api/deals/[id]/terms/route.test.ts`
- B2 `Done` — EntitlementPath model + route + tests + UI  
  Evidence: `packages/db/prisma/schema.prisma`, `apps/web/app/api/deals/[id]/entitlement-path/route.ts`, `apps/web/app/api/deals/[id]/entitlement-path/route.test.ts`
- B3 `Done` — EnvironmentalAssessment model + route + tests + UI  
  Evidence: `apps/web/app/api/deals/[id]/environmental-assessments/route.ts`, `apps/web/components/deals/EnvironmentalAssessmentsPanel.tsx`
- B4 `Done` — DealFinancing model + route + tests + UI  
  Evidence: `apps/web/app/api/deals/[id]/financings/route.ts`, `apps/web/components/deals/DealFinancingPanel.tsx`
- B5 `Done` — DealRisk model + route + tests + UI  
  Evidence: `apps/web/app/api/deals/[id]/risks/route.ts`, `apps/web/components/deals/RiskRegisterPanel.tsx`
- B6 `Done` — DealStakeholder model + route + tests + UI  
  Evidence: `apps/web/app/api/deals/[id]/stakeholders/route.ts`, `apps/web/components/deals/DealStakeholdersPanel.tsx`
- B7 `Done` — PropertyTitle + PropertySurvey models/routes/tests/UI  
  Evidence: `apps/web/app/api/deals/[id]/property-title/route.ts`, `apps/web/app/api/deals/[id]/property-survey/route.ts`

### Phase C — financial model depth

- C1 `Done` — rent roll modeling + CRUD + tool  
  Evidence: `apps/web/components/financial/RentRollTab.tsx`, `packages/openai/src/tools/dealTools.ts`
- C2 `Done` — development budget detail + tool  
  Evidence: `apps/web/components/financial/DevelopmentBudgetTab.tsx`, `packages/openai/src/tools/calculationTools.ts`
- C3 `Done` — capital stack + sources/uses + waterfall + tool  
  Evidence: `apps/web/components/financial/WaterfallBuilder.tsx`, `packages/openai/src/tools/dealTools.ts`
- C4 `Done` — multi-scenario stress testing + expected value  
  Evidence: `apps/web/components/financial/SensitivityTable.tsx`, `apps/web/lib/financial/stressTesting.ts`
- C5 `Done` — exit scenario modeling + ranking  
  Evidence: `apps/web/components/financial/ExitAnalysisView.tsx`, `packages/openai/src/tools/dealTools.ts`
- C6 `Done` — tax integration and after-tax metrics  
  Evidence: `apps/web/hooks/useProFormaCalculations.ts`, `apps/web/components/financial/ResultsDashboard.tsx`

### Phase D — agent tool depth

- D1 `Done` — `recommend_entitlement_path`  
  Evidence: `packages/openai/src/tools/dealTools.ts`, `packages/openai/src/tools/dealTools.phase-d.tools.test.ts`
- D2 `Done` — `analyze_comparable_sales`  
  Evidence: `packages/openai/src/tools/dealTools.ts`, `packages/openai/src/tools/dealTools.phase-d.tools.test.ts`
- D3 `Done` — `optimize_debt_structure`  
  Evidence: `packages/openai/src/tools/dealTools.ts`, `packages/openai/src/tools/dealTools.phase-d.tools.test.ts`
- D4 `Done` — `estimate_phase_ii_scope`  
  Evidence: `packages/openai/src/tools/dealTools.ts`, `packages/openai/src/tools/dealTools.phase-d.tools.test.ts`
- D5 `Done` — `analyze_title_commitment`  
  Evidence: `packages/openai/src/tools/dealTools.ts`, `packages/openai/src/tools/dealTools.phase-d.tools.test.ts`
- D6 `Done` — `generate_zoning_compliance_checklist`  
  Evidence: `packages/openai/src/tools/dealTools.ts`, `packages/openai/src/tools/dealTools.phase-d.tools.test.ts`
- D7 `Done` — `model_exit_scenarios` wired  
  Evidence: `packages/openai/src/tools/dealTools.ts`, `packages/openai/src/tools/index.ts`

### Phase E — automation enhancements

- E1 `Done` — financial auto-init handler + tests + registration  
  Evidence: `apps/web/lib/automation/financialInit.ts`, `apps/web/lib/automation/__tests__/financialInit.test.ts`, `apps/web/lib/automation/handlers.ts`
- E2 `Done` — deadline monitoring handler + cron + tests + config  
  Evidence: `apps/web/lib/automation/deadlineMonitoring.ts`, `apps/web/app/api/cron/deadline-check/route.ts`, `apps/web/lib/automation/__tests__/deadlineMonitoring.test.ts`, `apps/web/lib/automation/config.ts`
- E3 `Done` — contingency extraction business logic  
  Evidence: `apps/web/lib/services/documentProcessing.service.ts`, `apps/web/lib/validation/extractionSchemas.ts`
- E4 `Done` — market monitoring handler + cron + tests + config  
  Evidence: `apps/web/lib/automation/marketMonitoring.ts`, `apps/web/app/api/cron/market-monitor/route.ts`, `apps/web/lib/automation/__tests__/marketMonitoring.test.ts`
- E5 `Done` — automated knowledge capture + tests + registration  
  Evidence: `apps/web/lib/automation/knowledgeCapture.ts`, `apps/web/lib/automation/__tests__/knowledgeCapture.test.ts`, `apps/web/lib/automation/handlers.ts`

### Phase F — artifact templates

- F1 `Done` — triage PDF template + endpoint + automation trigger  
  Evidence: `packages/artifacts/templates/triage_report.html`, `apps/web/app/api/deals/[id]/artifacts/route.ts`, `apps/web/lib/automation/artifactAutomation.ts`
- F2 `Done` — submission checklist template + endpoint payload contract  
  Evidence: `packages/artifacts/templates/submission_checklist.html`, `apps/web/app/api/deals/[id]/artifacts/route.ts`
- F3 `Done` — buyer teaser template + endpoint + exit-marketed automation trigger  
  Evidence: `packages/artifacts/templates/buyer_teaser.html`, `apps/web/app/api/deals/[id]/artifacts/route.ts`, `apps/web/lib/automation/artifactAutomation.ts`
- F4 `Done` — exit package template + endpoint contract  
  Evidence: `packages/artifacts/templates/exit_package.html`, `apps/web/app/api/deals/[id]/artifacts/route.ts`

### Phase G — portfolio analytics depth

- G1 `Done` — concentration dashboard (HHI thresholds + top exposure + alerts)  
  Evidence: `apps/web/components/portfolio/ConcentrationCharts.tsx`, `apps/web/lib/services/portfolioAnalytics.service.ts`
- G2 `Done` — deal velocity and throughput metrics (avg/median/p75/p90, kill rate, funnel leakage, QoQ trend)  
  Evidence: `apps/web/app/api/portfolio/velocity/route.ts`, `apps/web/components/portfolio/DealVelocityMetrics.tsx`, `apps/web/lib/services/portfolioAnalytics.service.ts`
- G3 `Done` — capital deployment model + API + UI  
  Evidence: `packages/db/prisma/schema.prisma`, `packages/db/prisma/migrations/20260217170500_add_capital_deployments/migration.sql`, `apps/web/app/api/portfolio/capital-deployment/route.ts`, `apps/web/components/portfolio/CapitalDeploymentTracker.tsx`
- G4 `Done` — debt maturity wall with 12-month portfolio alert threshold  
  Evidence: `apps/web/app/api/portfolio/debt-maturity/route.ts`, `apps/web/components/portfolio/DebtMaturityWall.tsx`
- G5 `Done` — outcome vs prediction tracking in outcomes tab  
  Evidence: `apps/web/lib/services/outcomeTracking.service.ts`, `apps/web/app/portfolio/page.tsx`

## Residual gaps

- No `Partial` or `Missing` checklist items remain in A1→G5 for this audit date.
