import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Effect, FileSystem, Path, Predicate, Schema } from "effect";
import { Argument, Command } from "effect/cli";
import { AggregateContract, renderAggregate } from "./diagram";
import { DiagramError } from "./diagram-error";
import { readHandlerSource } from "./source";

const command = Command.make(
  "domain-devtools",
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
    const handlers = yield* readHandlerSource(absolutePath, exportName);
    const markdown = yield* Effect.try({
      try: () => renderAggregate(aggregate, handlers),
      catch: (cause) => DiagramError.make({ message: `Cannot render ${exportName}`, cause }),
    });
    const fs = yield* FileSystem.FileSystem;
    yield* fs.writeFileString(path.resolve(output), markdown);
  }),
).pipe(Command.withDescription("Generate source-backed Alchemy Domain aggregate diagrams"));

command.pipe(
  Command.run({ version: "0.1.0" }),
  Effect.scoped,
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain,
);
