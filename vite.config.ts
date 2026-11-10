import { antipattern, correctness, effectNative, strict, style } from "@effect/tsgo/oxlint-presets";
import { defineConfig } from "vite-plus";

export default defineConfig({
  fmt: { proseWrap: "never" },
  lint: {
    options: { typeAware: true, typeCheck: true },
    overrides: [
      {
        files: ["src/**/*.ts"],
        plugins: ["effecttsgo"],
        rules: {
          ...antipattern.rules,
          ...correctness.rules,
          ...effectNative.rules,
          ...style.rules,
          ...strict.rules,
          // Match Nispero: split global-json rules replace this deprecated diagnostic.
          "effecttsgo/prefer-schema-over-json": "off",
          // This source-based tool exposes experimental compiler APIs by design.
          "effecttsgo/api-stability-leak": "off",
          "effecttsgo/any-unknown-in-error-context": "error",
        },
      },
      {
        files: ["src/**/*.test.ts"],
        plugins: ["effecttsgo"],
        rules: {
          // Tests are composition roots and inspect failures from the compiler adapter.
          "effecttsgo/strict-effect-provide": "off",
          "effecttsgo/multiple-effect-provide": "off",
          "effecttsgo/unknown-in-effect-catch": "off",
          "effecttsgo/node-builtin-import": "off",
          "effecttsgo/process-env": "off",
          "effecttsgo/crypto-random-uuid": "off",
          "effecttsgo/global-console": "off",
        },
      },
      {
        files: ["src/**/*.{test,fixture}.ts"],
        plugins: ["effecttsgo"],
        rules: {
          // Trusted synthetic fixtures can fail immediately on invalid data.
          "effecttsgo/schema-sync": "off",
        },
      },
    ],
  },
  staged: { "*": "effect-tsgo --tsrs-lint vp check --fix --no-error-on-unmatched-pattern" },
  pack: {
    entry: { cli: "src/cli.ts" },
    outDir: "dist",
    dts: false,
    exports: false,
  },
  test: { include: ["src/**/*.test.ts"] },
});
