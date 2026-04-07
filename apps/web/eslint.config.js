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
  }
  ,
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
  }
];
