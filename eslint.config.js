import tsParser from "@typescript-eslint/parser";
import sonarjs from "eslint-plugin-sonarjs";
import maxFunctionsPerFile from "./scripts/max-functions-per-file.js";

export default [
  {
    files: ["src/**/*.{ts,tsx}", "scripts/**/*.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
        ecmaVersion: "latest",
        sourceType: "module",
      },
    },
    plugins: {
      sonarjs,
      project: { rules: { "max-functions-per-file": maxFunctionsPerFile } },
    },
    rules: {
      "max-depth": ["error", 4],
      "max-lines-per-function": [
        "error",
        { IIFEs: true, max: 100, skipBlankLines: true, skipComments: true },
      ],
      "max-nested-callbacks": ["error", 3],
      "sonarjs/cognitive-complexity": ["error", 15],
      "project/max-functions-per-file": ["error", { max: 20 }],
    },
  },
  {
    // JSX layout can exceed function limits; file size and function count still apply.
    files: ["src/features/**/*.tsx"],
    rules: {
      "max-lines-per-function": "off",
      "max-nested-callbacks": "off",
      "sonarjs/cognitive-complexity": "off",
    },
  },
];
