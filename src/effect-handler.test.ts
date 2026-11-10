import { Array, Effect, Schema } from "effect";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { AggregateContract } from "./diagram";
import { Wrapped } from "./effect-handler.fixture";
import { readHandlerSource } from "./source";
import { readStateDiagram } from "./state-diagram";

const path = fileURLToPath(new URL("effect-handler.fixture.ts", import.meta.url));

describe("Effect function handlers", () => {
  it("analyzes traced, named, aliased and untraced functions while retaining original wrapper source", () =>
    Effect.gen(function* () {
      const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(Wrapped);
      const diagram = yield* readStateDiagram({ path, exportName: "Wrapped", aggregate });
      expect(diagram.transitions).toEqual(
        Array.map(
          ["Plain", "Named", "Aliased", "Local", "Untraced", "Regular", "Generator"],
          (command) => ({ from: "Idle", event: "Activated", to: "Active", command }),
        ),
      );
      expect(diagram.unresolved).toEqual([
        "Transformed: Effect.fn transforms or self binding require analysis; the body alone does not determine emitted events",
      ]);
      const source = yield* readHandlerSource(path, "Wrapped");
      expect(source.decide.get("Plain")).toContain("Fx.fn(function*");
      expect(source.decide.get("Named")).toContain('Effect.fn("activate")');
      expect(source.decide.get("Transformed")).toContain("Effect.map(() => [])");
    }).pipe(Effect.runPromise));

  it("rejects unrelated functions named fn rather than assuming Effect semantics", () =>
    Effect.gen(function* () {
      const error = yield* readHandlerSource(path, "Imposter").pipe(Effect.flip);
      expect(error.cause).toEqual(
        expect.objectContaining({
          message: expect.stringContaining("Expected a handler function for Activate"),
        }),
      );
    }).pipe(Effect.runPromise));
});
