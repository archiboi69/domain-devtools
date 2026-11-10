import { NodeServices } from "@effect/platform-node";
import { Array, Effect, Stream, String as Str } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/process";
import { describe, expect, it } from "vite-plus/test";

const run = Effect.fn(function* (args: readonly string[]) {
  // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Exercise real process streams through Effect's pinned process adapter.
  const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
  const child = yield* spawner.spawn(
    // oxlint-disable-next-line effecttsgo/unstable-api-usage -- Effect has no stable child-process constructor.
    ChildProcess.make("vpx", ["src/cli.ts", ...args], { stdout: "pipe", stderr: "pipe" }),
  );
  return yield* Effect.all(
    {
      stdout: child.stdout.pipe(Stream.decodeText(), Stream.runCollect, Effect.map(Array.join(""))),
      stderr: child.stderr.pipe(Stream.decodeText(), Stream.runCollect, Effect.map(Array.join(""))),
      exitCode: child.exitCode,
    },
    { concurrency: "unbounded" },
  );
});
const entry = ["--entry", "src/catalog.fixture.ts"];

describe("CLI streams and selectors", () => {
  it(
    "renders only the selected command and lists domain names without diagnostics on stdout",
    () =>
      Effect.gen(function* () {
        const result = yield* run(["command", "Start", ...entry]);
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        expect(result.stdout).toContain("COMMAND: Start");
        expect(result.stdout).not.toContain("COMMAND: Finish");
        const names = yield* run([...entry, "models"]);
        expect(names.stdout).toBe("Primary\nSecondary\n");
        expect(names.stderr).toBe("");
        expect(names.exitCode).toBe(0);
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise),
    20_000,
  );

  it(
    "renders every aggregate command in declaration order with one document heading",
    () =>
      Effect.gen(function* () {
        const result = yield* run(["aggregate", "commands", "Lifecycle", ...entry]);
        expect(result.exitCode).toBe(0);
        expect(result.stderr).toBe("");
        const lines = Str.split(result.stdout, "\n");
        expect(Array.filter(lines, (line) => line === "# Lifecycle")).toHaveLength(1);
        expect(Array.filter(lines, Str.startsWith("## "))).toEqual([
          "## Start",
          "## Finish",
          "## ResetBlocked",
          "## ResetOtherKind",
          "## SelectNested",
        ]);
        expect(Array.filter(lines, (line) => line === "```mermaid")).toHaveLength(5);
        expect(result.stdout).toContain("### decide — Finish");
        expect(result.stdout).toContain("### evolve — Completed");
        expect(result.stdout).not.toContain("COMMAND: Increase");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise),
    20_000,
  );

  it(
    "reports partial analysis on stderr and fails without a diagram in strict mode",
    () =>
      Effect.gen(function* () {
        const partial = yield* run(["aggregate", "states", "Partial", ...entry]);
        expect(partial.exitCode).toBe(0);
        expect(partial.stdout).toContain("## Unresolved paths");
        expect(partial.stdout).not.toContain("Warning:");
        expect(partial.stderr).toContain("Warning: Partial:");
        const strict = yield* run(["aggregate", "states", "Partial", "--strict", ...entry]);
        expect(strict.exitCode).not.toBe(0);
        expect(strict.stdout).toBe("");
        expect(strict.stderr).toContain("unresolved analysis paths");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise),
    20_000,
  );

  it(
    "keeps selection and argument errors off stdout",
    () =>
      Effect.gen(function* () {
        const missing = yield* run(["command", "Missing", ...entry]);
        expect(missing.exitCode).not.toBe(0);
        expect(missing.stdout).toBe("");
        expect(missing.stderr).toContain("Unknown command: Missing");
        const invalid = yield* run(["command", ...entry]);
        expect(invalid.exitCode).not.toBe(0);
        expect(invalid.stdout).toBe("");
        expect(invalid.stderr).toContain("command-tag");
        expect(invalid.stderr).not.toContain("Help requested");
      }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise),
    20_000,
  );
});
