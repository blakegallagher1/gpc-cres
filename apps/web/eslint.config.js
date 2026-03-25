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
  }
];
