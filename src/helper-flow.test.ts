import { Array, Effect, Schema } from "effect";
import { fileURLToPath } from "node:url";
import { expect, it } from "vite-plus/test";
import { AggregateContract } from "./diagram";
import { HelperFlow } from "./helper-flow.fixture";
import { readStateDiagram } from "./state-diagram";

it.each([
  "Finish",
  "Plain",
  "Recursive",
  "VoidValidation",
  "FallthroughValidation",
  "BareReturnValidation",
  "DeniedValidation",
])("analyzes %s helper paths", (command) =>
  Effect.gen(function* () {
    const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(HelperFlow);
    const diagram = yield* readStateDiagram({
      path: fileURLToPath(new URL("helper-flow.fixture.ts", import.meta.url)),
      exportName: "HelperFlow",
      aggregate: {
        ...aggregate,
        definition: {
          ...aggregate.definition,
          commands: Array.filter(
            aggregate.definition.commands,
            (contract) => contract.tag === command,
          ),
        },
      },
    });
    expect(diagram.transitions).toEqual(
      command === "Recursive" || command === "DeniedValidation"
        ? []
        : [{ from: "Ready", event: "Finished", to: "Done", command }],
    );
    expect(diagram.unresolved).toEqual(
      command === "Recursive" ? ["Recursive: Recursive helper or helper depth limit reached"] : [],
    );
  }).pipe(Effect.runPromise),
);
