import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path, Predicate, Schema } from "effect";
import { Argument, Command } from "effect/cli";
import { AggregateContract, renderAggregate } from "./diagram";
import { DiagramError } from "./diagram-error";
import { readHandlerSource } from "./source";
import { readStateDiagram, renderStateDiagram } from "./state-diagram";

function aggregateDiagram<const Name extends string>(
  name: Name,
  description: string,
  render: (source: {
    readonly path: string;
    readonly exportName: string;
    readonly aggregate: AggregateContract;
  }) => Effect.Effect<string, DiagramError>,
) {
  return Command.make(
    name,
    {
      module: Argument.File("aggregate-module", { mustExist: true }).pipe(
        Argument.withDescription(
          "Trusted local TypeScript aggregate module (import executes its code)",
        ),
      ),
      exportName: Argument.String("export-name").pipe(
        Argument.withDescription("Exported aggregate class name"),
      ),
      output: Argument.File("output").pipe(
        Argument.withDescription("Output Markdown file (replaces an existing file)"),
      ),
    },
    Effect.fn("generateDiagram")(function* ({ module, exportName, output }) {
      const path = yield* Path.Path;
      const absolutePath = path.resolve(module);
      const url = yield* path.toFileUrl(absolutePath);
      // Import executes module-level code. The CLI accepts trusted local modules only.
      const loaded: unknown = yield* Effect.tryPromise({
        try: () => import(url.href),
        catch: (cause) => DiagramError.make({ message: `Cannot import ${absolutePath}`, cause }),
      });
      if (!Predicate.hasProperty(loaded, exportName)) {
        return yield* DiagramError.make({ message: `Missing aggregate export: ${exportName}` });
      }
      const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(loaded[exportName]);
      const markdown = yield* render({ path: absolutePath, exportName, aggregate });
      const fs = yield* FileSystem.FileSystem;
      yield* fs.writeFileString(path.resolve(output), markdown);
    }),
  ).pipe(Command.withDescription(description));
}

const commands = aggregateDiagram(
  "commands",
  "Generate a diagram for every command in one aggregate",
  Effect.fn(function* ({ path, exportName, aggregate }) {
    const handlers = yield* readHandlerSource(path, exportName);
    return yield* Effect.try({
      try: () => renderAggregate(aggregate, handlers),
      catch: (cause) => DiagramError.make({ message: `Cannot render ${exportName}`, cause }),
    });
  }),
);
const states = aggregateDiagram(
  "states",
  "Generate one aggregate state overview, including self-loops",
  (source) => readStateDiagram(source).pipe(Effect.map(renderStateDiagram)),
);

Command.make("domain-devtools").pipe(
  Command.withDescription("Generate source-backed Alchemy Domain diagrams"),
  Command.withSubcommands([
    Command.make("aggregate").pipe(
      Command.withDescription("Inspect an aggregate"),
      Command.withSubcommands([commands, states]),
    ),
  ]),
  Command.run({ version: "0.1.0" }),
  Effect.scoped,
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
