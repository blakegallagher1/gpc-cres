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
      "lib/services/deal-reader.ts",
      "lib/services/trajectoryLog.service.ts",
      "lib/services/outcomeReinforcement.service.ts",
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
      "app/api/memory/innovation-queue/route.ts",
      "app/api/memory/stats/route.ts",
      "app/api/workflows/route.ts",
      "app/api/workflows/[id]/route.ts",
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
      "app/api/memory/entities/[entityId]/route.ts",
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
          ],
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
