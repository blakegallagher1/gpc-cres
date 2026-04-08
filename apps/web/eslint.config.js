const nextPlugin = require("@next/eslint-plugin-next");
const nextParser = require("next/dist/compiled/babel/eslint-parser");
const globals = require("globals");

module.exports = [
  {
    ignores: [
      ".next/**",
      ".next-*/**",
      "node_modules/**",
      "dist/**",
      "out/**",
      "output/**",
      "coverage/**",
      "test-results/**",
    ]
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: nextParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        requireConfigFile: false,
        babelOptions: {
          presets: ["next/babel"]
        }
      },
      globals: {
        ...globals.browser,
        ...globals.node
      }
    },
    plugins: {
      "@next/next": nextPlugin
    },
    rules: {
      ...nextPlugin.configs["core-web-vitals"].rules,
      "no-console": ["error", { allow: ["warn", "error"] }]
    }
  },
  {
    files: [
      "**/*.test.{js,jsx,ts,tsx}",
      "**/__tests__/**/*.{js,jsx,ts,tsx}",
      "scripts/**/*.{js,jsx,ts,tsx}",
      "lib/server/observability.ts",
    ],
    rules: {
      "no-console": "off",
    },
  },
  {
    files: [
      "app/api/agent/route.ts",
      "app/api/chat/route.ts",
      "app/api/search/route.ts",
      "app/api/admin/memory/[id]/route.ts",
      "app/api/deals/[id]/triage/route.ts",
      "app/api/deals/[id]/tasks/[taskId]/run/route.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@entitlement-os/db",
              message:
                "Route handlers must delegate persistence to package-level services or repositories.",
            },
            {
              name: "@temporalio/client",
              message:
                "Route handlers must delegate Temporal access to @gpc/server workflow or deal services.",
            },
            {
              name: "@/lib/workflowClient",
              message:
                "Route handlers must use package-level services instead of the compatibility Temporal wrapper.",
            },
            {
              name: "@/lib/agent/agentRunner",
              message:
                "Route handlers must call @gpc/server chat services instead of route-level agent orchestration wrappers.",
            },
            {
              name: "@/lib/services/documentProcessingExtraction",
              message:
                "Route handlers must delegate document extraction to package-level evidence or server services.",
            },
            {
              name: "@/lib/server/observabilityStore",
              message:
                "Route handlers must use package-level observability services instead of direct store internals.",
            },
          ],
          patterns: [
            {
              group: ["@entitlement-os/db/*"],
              message:
                "Route handlers must delegate persistence to package-level services or repositories.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["app/api/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@temporalio/client",
              message:
                "API routes must delegate Temporal access to package-level workflow services.",
            },
            {
              name: "@/lib/workflowClient",
              message:
                "API routes must use package-level services instead of the legacy Temporal client wrapper.",
            },
            {
              name: "@/lib/agent/agentRunner",
              message:
                "API routes must call package-level chat or deal services instead of direct agent orchestration wrappers.",
            },
            {
              name: "@/lib/services/documentProcessingExtraction",
              message:
                "API routes must delegate extraction and document intelligence to package-level evidence services.",
            },
            {
              name: "@/lib/server/observabilityStore",
              message:
                "API routes must use package-level observability services instead of direct store internals.",
            },
          ],
        },
      ],
    },
  },
  {
    files: ["lib/server/**/*.{js,jsx,ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@entitlement-os/db",
              message:
                "apps/web/lib/server must delegate persistence to package-level services or repositories.",
            },
            {
              name: "@entitlement-os/openai",
              message:
                "apps/web/lib/server must not host backend OpenAI runtime orchestration directly.",
            },
            {
              name: "openai",
              message:
                "apps/web/lib/server must not instantiate raw OpenAI clients directly.",
            },
            {
              name: "@temporalio/client",
              message:
                "apps/web/lib/server must not host Temporal clients directly.",
            },
          ],
          patterns: [
            {
              group: ["@entitlement-os/db/*", "@entitlement-os/openai/*"],
              message:
                "apps/web/lib/server must use package-level facades for backend runtime and persistence access.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      // Wave 1 — original migrated seams
      "lib/services/saved-search.service.ts",
      "lib/services/notification.service.ts",
      "lib/services/daily-briefing.service.ts",
      "lib/services/knowledgeBase.service.ts",
      "lib/services/proactiveAction.service.ts",
      "lib/services/documentProcessingExtraction.ts",
      "lib/services/agentLearning.service.ts",
      "lib/services/preferenceService.ts",
      "lib/services/preferenceExtraction.service.ts",
      "lib/services/approval.service.ts",
      "lib/services/intentClassifier.ts",
      "lib/services/documentProcessing.service.ts",
      "lib/services/calibrationService.ts",
      "lib/services/entityResolution.ts",
      "lib/services/automationEvent.service.ts",
      "lib/services/proactiveTrigger.service.ts",
      "lib/services/driftFreezeService.ts",
      "lib/services/entitlementKpiMonitor.service.ts",
      "lib/services/entitlementStrategyAutopilot.service.ts",
      "lib/services/causalDag.ts",
      "lib/services/causalPropagation.ts",
      "lib/services/counterfactualLearning.ts",
      "lib/services/injectionBudget.ts",
      "lib/services/learningContextBuilder.ts",
      "lib/services/memoryContextBuilder.ts",
      "lib/services/memoryTierService.ts",
      "lib/services/calibrationEviction.ts",
      "lib/services/anomalyDetector.ts",
      "lib/services/dynamicThreshold.ts",
      "lib/services/entityCollisionDetector.ts",
      "lib/services/noveltyDetector.ts",
      "lib/services/memoryWriteGate.ts",
      "lib/services/documentProcessingPersistence.ts",
      "lib/services/outcomeTracking.service.ts",
      "lib/services/memoryIngestion.service.ts",
      "lib/services/marketMonitor.service.ts",
      "lib/services/memoryEventService.ts",
      "lib/services/memoryRetrieval.ts",
      "lib/services/truthViewService.ts",
      "lib/services/conflictDetection.ts",
      "lib/services/buildingPermits.service.ts",
      "lib/services/businessMemory.service.ts",
      "lib/services/compToMarket.ts",
      "lib/services/agentGraders.service.ts",
      "lib/services/promptOptimization.service.ts",
      "lib/services/promptVersioning.service.ts",
      "lib/services/correctionService.ts",
      "lib/services/confidenceScoring.ts",
      "lib/services/episodicMemory.service.ts",
      "lib/services/learningFactPromotion.service.ts",
      "lib/services/proceduralSkill.service.ts",
      "lib/services/outcomeCapture.service.ts",
      "lib/chat/session.ts",
      "lib/services/deal-reader.ts",
      "lib/services/trajectoryLog.service.ts",
      "lib/services/outcomeReinforcement.service.ts",
      "lib/agent/reward.service.ts",
      "lib/automation/config.ts",
      "lib/automation/deadlineMonitoring.ts",
      "lib/automation/advancement.ts",
      "lib/automation/types.ts",
      "lib/automation/notifications.ts",
      "lib/automation/context.ts",
      "lib/automation/intake.ts",
      "lib/automation/triage.ts",
      "lib/automation/taskExecution.ts",
      "lib/automation/documents.ts",
      "lib/automation/buyerOutreach.ts",
      "lib/automation/enrichment.ts",
      "lib/automation/marketMonitoring.ts",
      "lib/automation/knowledgeCapture.ts",
      "lib/automation/agentLearningPromotion.ts",
      "lib/automation/artifactAutomation.ts",
      "lib/automation/sentry.ts",
      "lib/automation/timeout.ts",
      "lib/automation/taskAllowlist.ts",
      "lib/jobs/deadline-monitor.job.ts",
      "lib/jobs/opportunity-scanner.job.ts",
      "lib/jobs/calibrationRecompute.ts",
      "lib/agent/agentRunner.ts",
      "lib/server/observability.ts",
      "lib/workflowClient.ts",
      "app/api/intelligence/daily-briefing/route.ts",
      "app/api/cron/deadline-monitor/route.ts",
      // Wave 8 — thinned admin/cron routes
      "app/api/admin/stats/route.ts",
      "app/api/admin/export/route.ts",
      "app/api/admin/knowledge/[id]/route.ts",
      "app/api/cron/drift-monitor/route.ts",
      "app/api/cron/opportunity-scan/route.ts",
      // Wave 9 — thinned memory/workflow/entity routes
      "app/api/entities/lookup/route.ts",
      "app/api/entities/route.ts",
      "app/api/entities/[id]/route.ts",
      "app/api/evidence/route.ts",
      "app/api/memory/entities/[entityId]/route.ts",
      "app/api/memory/collisions/route.ts",
      "app/api/memory/feedback/route.ts",
      "app/api/memory/ingest/route.ts",
      "app/api/memory/innovation-queue/route.ts",
      "app/api/memory/stats/route.ts",
      "app/api/workflows/route.ts",
      "app/api/workflows/[id]/route.ts",
      "app/api/buyers/route.ts",
      "app/api/public/mhc-owner-submissions/route.ts",
      "app/api/geofences/route.ts",
      "app/api/geofences/[id]/route.ts",
      "app/api/jurisdictions/route.ts",
      "app/api/map/prospect/route.ts",
      "app/api/evidence/sources/[sourceId]/package/route.ts",
      "app/api/evidence/snapshots/[snapshotId]/download/route.ts",
      "app/api/cron/entitlement-precedent-backfill/route.ts",
      "app/api/cron/entity-revalidation/route.ts",
      "app/api/parcels/route.ts",
      "app/api/parcels/suggest/route.ts",
      "app/api/deals/[id]/activity/route.ts",
      "app/api/deals/[id]/tasks/route.ts",
      "app/api/deals/[id]/stakeholders/route.ts",
      "app/api/deals/[id]/risks/route.ts",
      "app/api/deals/[id]/terms/route.ts",
      "app/api/deals/[id]/property-title/route.ts",
      "app/api/deals/[id]/property-survey/route.ts",
      "app/api/deals/[id]/entitlement-path/route.ts",
      "app/api/deals/[id]/screen/route.ts",
      "app/api/deals/[id]/debt-comparison/route.ts",
      "app/api/deals/[id]/scenarios/route.ts",
      "app/api/deals/[id]/financings/route.ts",
      "app/api/deals/[id]/waterfall/route.ts",
      "app/api/deals/[id]/environmental-assessments/route.ts",
      "app/api/deals/[id]/parcels/route.ts",
      "app/api/deals/[id]/parcels/[parcelId]/enrich/route.ts",
      "app/api/deals/[id]/uploads/route.ts",
      "app/api/deals/[id]/uploads/[uploadId]/route.ts",
      "app/api/deals/[id]/extractions/route.ts",
      "app/api/deals/[id]/extractions/[extractionId]/route.ts",
      "app/api/deals/artifacts/[artifactId]/download/route.ts",
      "app/api/runs/route.ts",
      "app/api/runs/[runId]/route.ts",
      "app/api/runs/[runId]/reward/route.ts",
      "app/api/runs/[runId]/traces/route.ts",
      "app/api/runs/dashboard/route.ts",
      "app/api/agent-learning/stats/route.ts",
      "app/api/tools/health/route.ts",
      "app/api/wealth/summary/route.ts",
      "app/api/wealth/tax-events/route.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@entitlement-os/db",
              message:
                "This migrated web-layer seam must stay package-backed and may not import Prisma directly.",
            },
            {
              name: "@entitlement-os/openai",
              message:
                "This migrated web-layer seam must stay package-backed and may not import backend OpenAI helpers directly.",
            },
            {
              name: "openai",
              message:
                "This migrated web-layer seam must stay package-backed and may not instantiate raw OpenAI clients directly.",
            },
            {
              name: "@temporalio/client",
              message:
                "This migrated web-layer seam must use @gpc/server workflow services instead of direct Temporal clients.",
            },
            {
              name: "unpdf",
              message:
                "This migrated web-layer seam must use @entitlement-os/evidence for PDF parsing instead of unpdf directly.",
            },
          ],
          patterns: [
            {
              group: ["@entitlement-os/db/*", "@entitlement-os/openai/*"],
              message:
                "This migrated web-layer seam must use package-level services instead of backend internals.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "app/api/entities/route.ts",
      "app/api/entities/[id]/route.ts",
      "app/api/evidence/route.ts",
      "app/api/evidence/sources/[sourceId]/package/route.ts",
      "app/api/evidence/snapshots/[snapshotId]/download/route.ts",
      "app/api/assets/route.ts",
      "app/api/assets/[id]/route.ts",
      "app/api/buyers/route.ts",
      "app/api/geofences/route.ts",
      "app/api/geofences/[id]/route.ts",
      "app/api/health/route.ts",
      "app/api/health/detailed/route.ts",
      "app/api/intelligence/deadlines/route.ts",
      "app/api/jurisdictions/route.ts",
      "app/api/map/prospect/route.ts",
      "app/api/memory/ingest/route.ts",
      "app/api/memory/entities/[entityId]/route.ts",
      "app/api/parcels/route.ts",
      "app/api/parcels/suggest/route.ts",
      "app/api/portfolio/route.ts",
      "app/api/deals/[id]/activity/route.ts",
      "app/api/deals/[id]/tasks/route.ts",
      "app/api/deals/[id]/stakeholders/route.ts",
      "app/api/deals/[id]/risks/route.ts",
      "app/api/deals/[id]/terms/route.ts",
      "app/api/deals/[id]/property-title/route.ts",
      "app/api/deals/[id]/property-survey/route.ts",
      "app/api/deals/[id]/entitlement-path/route.ts",
      "app/api/deals/[id]/screen/route.ts",
      "app/api/deals/[id]/debt-comparison/route.ts",
      "app/api/deals/[id]/scenarios/route.ts",
      "app/api/deals/[id]/financings/route.ts",
      "app/api/deals/[id]/waterfall/route.ts",
      "app/api/deals/[id]/environmental-assessments/route.ts",
      "app/api/deals/[id]/parcels/route.ts",
      "app/api/deals/[id]/parcels/[parcelId]/enrich/route.ts",
      "app/api/deals/[id]/uploads/route.ts",
      "app/api/deals/[id]/uploads/[uploadId]/route.ts",
      "app/api/deals/[id]/extractions/route.ts",
      "app/api/deals/[id]/extractions/[extractionId]/route.ts",
      "app/api/deals/artifacts/[artifactId]/download/route.ts",
      "app/api/runs/route.ts",
      "app/api/runs/[runId]/route.ts",
      "app/api/runs/[runId]/reward/route.ts",
      "app/api/runs/[runId]/traces/route.ts",
      "app/api/runs/dashboard/route.ts",
      "app/api/chat/conversations/route.ts",
      "app/api/chat/conversations/[id]/route.ts",
      "app/api/agent-learning/stats/route.ts",
      "app/api/tools/health/route.ts",
      "app/api/workflows/[id]/route.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@gpc/server/services/entity-management.service",
              message:
                "This migrated route must import entity management via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/evidence-source.service",
              message:
                "This migrated route must import evidence services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/memory-entity.service",
              message:
                "This migrated route must import memory-entity services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/workflows/workflow-template.service",
              message:
                "This migrated route must import workflow services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/asset-management.service",
              message:
                "This migrated route must import asset services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/buyer-management.service",
              message:
                "This migrated route must import buyer services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/geofence-management.service",
              message:
                "This migrated route must import geofence services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/chat/conversation-route.service",
              message:
                "This migrated route must import conversation services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/deals/deal-activity.service",
              message:
                "This migrated route must import deal activity services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/deals/deal-workspace.service",
              message:
                "This migrated route must import deal workspace services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/deals/deal-diligence.service",
              message:
                "This migrated route must import deal diligence services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/deals/deal-screen.service",
              message:
                "This migrated route must import deal screen services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/deals/deal-upload.service",
              message:
                "This migrated route must import deal upload services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/deals/deal-extraction-route.service",
              message:
                "This migrated route must import deal extraction services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/deals/deal-artifact-delivery.service",
              message:
                "This migrated route must import deal artifact delivery services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/evidence-delivery.service",
              message:
                "This migrated route must import evidence delivery services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/jurisdiction-catalog.service",
              message:
                "This migrated route must import jurisdiction services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/memory-ingestion-route.service",
              message:
                "This migrated route must import memory-ingestion services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/portfolio-summary.service",
              message:
                "This migrated route must import portfolio services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/search/parcel-search.service",
              message:
                "This migrated route must import parcel search services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/search/prospect-search.service",
              message:
                "This migrated route must import prospect search services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/run-route.service",
              message:
                "This migrated route must import run services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/observability/run-dashboard.service",
              message:
                "This migrated route must import run dashboard services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/observability/tool-health.service",
              message:
                "This migrated route must import tool health services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/observability/agent-learning-stats.service",
              message:
                "This migrated route must import agent-learning stats via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/observability/health-access.service",
              message:
                "This migrated route must import health access services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/observability/health-status.service",
              message:
                "This migrated route must import health status services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/intelligence-deadlines.service",
              message:
                "This migrated route must import intelligence deadline services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/public-mhc-owner-submission.service",
              message:
                "This migrated route must import public submission services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/entitlement-precedent-backfill-cron.service",
              message:
                "This migrated route must import precedent backfill cron services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/entity-revalidation-cron.service",
              message:
                "This migrated route must import entity revalidation services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/wealth-summary.service",
              message:
                "This migrated route must import wealth summary services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/services/wealth-tax-event.service",
              message:
                "This migrated route must import wealth tax event services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/observability/reward-signal.service",
              message:
                "This migrated helper must import reward signal persistence via the stable @gpc/server barrel.",
            },
          ],
        },
      ],
    },
  },
  {
    files: [
      "app/api/deals/route.ts",
      "app/api/deals/[id]/route.ts",
      "app/api/deals/[id]/financial-model/route.ts",
      "app/api/deals/[id]/artifacts/route.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@entitlement-os/db",
              message:
                "This migrated route must not import Prisma directly. Use @gpc/server deal route services.",
            },
            {
              name: "@entitlement-os/openai",
              message:
                "This migrated route must not import OpenAI package services directly. Use @gpc/server deal route services.",
            },
            {
              name: "openai",
              message:
                "This migrated route must not instantiate raw OpenAI clients. Use @gpc/server deal route services.",
            },
            {
              name: "@gpc/server/deals/deal.service",
              message:
                "This migrated route must import deal services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/deals/deal-financial-model-route.service",
              message:
                "This migrated route must import financial model services via the stable @gpc/server barrel.",
            },
            {
              name: "@gpc/server/deals/deal-artifact-route.service",
              message:
                "This migrated route must import artifact services via the stable @gpc/server barrel.",
            },
          ],
          patterns: ["@entitlement-os/db/*", "@entitlement-os/openai/*"],
        },
      ],
    },
  },
  {
    // Soft fence: all of lib/automation/** and lib/jobs/** must avoid raw
    // @temporalio/client and openai imports — automation/jobs should delegate
    // backend orchestration to package-level services. Direct prisma imports
    // are still permitted in not-yet-migrated handlers (logic-heavy backlog),
    // so they are NOT in this rule.
    files: ["lib/automation/**/*.{js,jsx,ts,tsx}", "lib/jobs/**/*.{js,jsx,ts,tsx}"],
    ignores: ["lib/automation/**/__tests__/**", "lib/jobs/**/__tests__/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "@temporalio/client",
              message:
                "Automation/jobs must not host Temporal clients directly — use @gpc/server workflow services.",
            },
            {
              name: "openai",
              message:
                "Automation/jobs must not instantiate raw OpenAI clients directly — use @gpc/server services.",
            },
            {
              name: "@/lib/workflowClient",
              message:
                "Automation/jobs must use @gpc/server workflow services instead of the legacy Temporal client wrapper.",
            },
          ],
        },
      ],
    },
  },
];
