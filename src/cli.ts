import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Array, Cause, Console, Effect, Option, Order, Schema } from "effect";
import { Argument, CliError, CliOutput, Command, Flag } from "effect/cli";
import { filterModels, loadCatalog, selectAggregate } from "./catalog";
import { renderCommand } from "./diagram";
import { DiagramError } from "./diagram-error";
import { readAggregateLocation, readHandlerSource } from "./source";
import { readStateDiagram, renderStateDiagram } from "./state-diagram";

const root = Command.make("domain-devtools").pipe(
  Command.withDescription("Generate source-backed Alchemy Domain diagrams on stdout"),
  Command.withSharedFlags({
    config: Flag.File("config").pipe(
      Flag.withDefault("domain-devtools.json"),
      Flag.withDescription("Project configuration; entries are relative to this file"),
    ),
    entry: Flag.File("entry", { mustExist: true }).pipe(
      Flag.optional,
      Flag.withDescription(
        "Trusted model module; overrides configured entries (import executes code)",
      ),
    ),
    model: Flag.String("model").pipe(
      Flag.optional,
      Flag.withDescription("Filter by Domain model name when selection is ambiguous"),
    ),
  }),
);

const catalog = Effect.gen(function* () {
  const options = yield* root;
  const models = yield* loadCatalog(options);
  return yield* filterModels(models, options.model);
});

const resolve = Effect.fn("resolve")(function* (kind: "command" | "aggregate", name: string) {
  const models = yield* catalog;
  const { entry, index, aggregate } = yield* selectAggregate(models, { kind, name });
  const location = yield* readAggregateLocation({
    path: entry.path,
    exportName: entry.exportName,
    index,
    aggregateName: aggregate.aggregateName,
  });
  return { ...location, aggregate };
});

const command = Command.make(
  "command",
  { name: Argument.String("command-tag") },
  Effect.fn(function* ({ name }) {
    const source = yield* resolve("command", name);
    const handlers = yield* readHandlerSource(source.path, source.exportName);
    const markdown = yield* Effect.try({
      try: () => renderCommand(source.aggregate, name, handlers),
      catch: (cause) => DiagramError.make({ message: `Cannot render ${name}`, cause }),
    });
    yield* Console.log(markdown);
  }),
).pipe(Command.withDescription("Render one command diagram as Markdown"));

const states = Command.make(
  "states",
  {
    name: Argument.String("aggregate-name"),
    strict: Flag.Boolean("strict").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Fail without output if analysis gaps remain"),
    ),
  },
  Effect.fn(function* ({ name, strict }) {
    const source = yield* resolve("aggregate", name);
    const diagram = yield* readStateDiagram(source);
    if (diagram.unresolved.length > 0) {
      const message = `${name}: ${diagram.unresolved.length} unresolved analysis paths`;
      if (strict) return yield* DiagramError.make({ message });
      yield* Console.error(`Warning: ${message}; see Unresolved paths in the report`);
    }
    yield* Console.log(renderStateDiagram(diagram));
  }),
).pipe(Command.withDescription("Render an aggregate state overview, including self-loops"));

const models = Command.make(
  "models",
  {},
  Effect.fn(function* () {
    const models = yield* catalog;
    yield* printNames(Array.map(models, ({ model }) => model.modelName));
  }),
).pipe(Command.withDescription("List model names"));
const commands = Command.make(
  "commands",
  {},
  Effect.fn(function* () {
    const models = yield* catalog;
    yield* printNames(
      Array.flatMap(models, ({ model }) =>
        Array.flatMap(model.aggregates, (aggregate) =>
          Array.map(aggregate.definition.commands, (command) => command.tag),
        ),
      ),
    );
  }),
).pipe(Command.withDescription("List command tags"));
const aggregates = Command.make(
  "aggregates",
  {},
  Effect.fn(function* () {
    const models = yield* catalog;
    yield* printNames(
      Array.flatMap(models, ({ model }) =>
        Array.map(model.aggregates, (aggregate) => aggregate.aggregateName),
      ),
    );
  }),
).pipe(Command.withDescription("List aggregate names"));

function printNames(names: readonly string[]) {
  return Console.log(Array.join(Array.sort(Array.dedupe(names), Order.String), "\n"));
}

root.pipe(
  Command.withSubcommands([
    command,
    models,
    commands,
    aggregates,
    Command.make("aggregate").pipe(Command.withSubcommands([states])),
  ]),
  Command.run({ version: "0.1.0" }),
  Effect.tapCause((cause) =>
    Option.exists(Cause.findErrorOption(cause), Schema.is(CliError.ShowHelp))
      ? Effect.void
      : Console.error(Cause.pretty(cause)),
  ),
  Effect.provideService(CliOutput.Presenter, {
    present: Effect.fn(function* (event) {
      if (event._tag !== "InvalidInvocation")
        return yield* CliOutput.defaultPresenter.present(event);
      const formatter = yield* CliOutput.Formatter;
      yield* Console.error(formatter.formatHelpDoc(event.helpDoc));
      yield* Console.error(formatter.formatErrors(event.errors));
    }),
  }),
  Effect.scoped,
  Effect.provide(NodeServices.layer),
  NodeRuntime.runMain({ disableErrorReporting: true }),
);
