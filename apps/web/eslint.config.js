const nextPlugin = require("@next/eslint-plugin-next");
const nextParser = require("next/dist/compiled/babel/eslint-parser");
const globals = require("globals");

module.exports = [
  {
    ignores: [".next/**", "node_modules/**", "dist/**", "out/**"]
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
      ...nextPlugin.configs["core-web-vitals"].rules
    }
  }
];
