// The lint the check runs, on node: the recommended rules, typescript-eslint's, every directive's
// description, and the sources' imports held to node's own modules and the package's files.
// See architecture/principles/comments.md
// See architecture/principles/minimal-footprint.md

import comments from "@eslint-community/eslint-plugin-eslint-comments";
import js from "@eslint/js";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

const code = ["**/*.js", "**/*.ts"];
const packageSpecifier = "^(?!node:|\\.{1,2}/)";

export default defineConfig([
  { ignores: ["dist/"] },
  { files: code, extends: [js.configs.recommended, tseslint.configs.recommended] },
  { files: code, languageOptions: { globals: globals.node } },
  {
    files: code,
    plugins: { "@eslint-community/eslint-comments": comments },
    rules: {
      "@eslint-community/eslint-comments/require-description": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        {
          "ts-check": false,
          "ts-expect-error": "allow-with-description",
          "ts-ignore": "allow-with-description",
          "ts-nocheck": "allow-with-description",
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: ["src/**"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              regex: packageSpecifier,
              message:
                "The package has no runtime dependency: a specifier that is neither a node: " +
                "builtin nor a relative path names a package it would need at runtime. Import " +
                "node's modules by node: or the package's own files by a relative path.",
            },
          ],
        },
      ],
    },
  },
]);
