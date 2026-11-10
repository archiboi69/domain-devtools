import { Effect, Schema } from "effect";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";
import { AggregateContract } from "./diagram";
import { Optics } from "./optic.fixture";
import { readStateDiagram } from "./state-diagram";

it("resolves Effect optic focus and callback updates without assuming all optics preserve the root tag", () =>
  Effect.gen(function* () {
    const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(Optics);
    const diagram = yield* readStateDiagram({
      path: fileURLToPath(new URL("optic.fixture.ts", import.meta.url)),
      exportName: "Optics",
      aggregate,
    });
    expect(diagram.transitions).toEqual([
      { from: "Before", event: "CountSet", to: "Before", command: "CountSet" },
      { from: "Live", event: "CountSet", to: "Live", command: "CountSet" },
      { from: "Done", event: "CountSet", to: "Done", command: "CountSet" },
      { from: "Live", event: "CurriedSet", to: "Live", command: "CurriedSet" },
      { from: "Live", event: "Changed", to: "Live", command: "Changed" },
      { from: "Live", event: "Whole", to: "Done", command: "Whole" },
      { from: "Live", event: "Replaced", to: "Done", command: "Replaced" },
    ]);
    expect(diagram.unresolved).toEqual([
      expect.stringContaining("TagTouched: unresolved destination:"),
      expect.stringContaining("Fake: unresolved destination:"),
    ]);
  }).pipe(Effect.runPromise));
