import { Array, Effect, FileSystem, Option, Path, Predicate, Record, Schema } from "effect";
import { AggregateContract } from "./diagram";
import { DiagramError } from "./diagram-error";

const Configuration = Schema.Struct({ entries: Schema.NonEmptyArray(Schema.NonEmptyString) });
const ModelFields = Schema.Struct({
  modelName: Schema.String,
  aggregates: Schema.Array(AggregateContract),
});
const ModelContract = Schema.declare<typeof ModelFields.Type>(
  (value): value is typeof ModelFields.Type =>
    Predicate.hasProperty(value, "kind") &&
    value.kind === "Model" &&
    Predicate.hasProperty(value, "modelName") &&
    Predicate.hasProperty(value, "aggregates") &&
    Schema.is(ModelFields)({ modelName: value.modelName, aggregates: value.aggregates }),
);

export interface ModelEntry {
  readonly path: string;
  readonly exportName: string;
  readonly model: typeof ModelContract.Type;
}

export interface AggregateSelection {
  readonly entry: ModelEntry;
  readonly index: number;
  readonly aggregate: AggregateContract;
}

/** Import only configured, trusted entry modules; never scan or start a model runtime. */
export const loadCatalog = Effect.fn("loadCatalog")(function* (options: {
  readonly config: string;
  readonly entry: Option.Option<string>;
}) {
  const path = yield* Path.Path;
  const fs = yield* FileSystem.FileSystem;
  const entries = yield* Option.match(options.entry, {
    onSome: (entry) => Effect.succeed([path.resolve(entry)]),
    onNone: () =>
      Effect.gen(function* () {
        const configPath = path.resolve(options.config);
        const text = yield* fs.readFileString(configPath).pipe(
          Effect.mapError((cause) =>
            DiagramError.make({
              message: `Cannot read ${configPath}; configure model entries or use --entry`,
              cause,
            }),
          ),
        );
        const config = yield* Schema.decodeEffect(Schema.fromJsonString(Configuration))(text).pipe(
          Effect.mapError((cause) =>
            DiagramError.make({ message: `Invalid configuration: ${configPath}`, cause }),
          ),
        );
        return Array.map(config.entries, (entry) => path.resolve(path.dirname(configPath), entry));
      }),
  });
  const catalog: ModelEntry[] = [];
  const seen = new Set<typeof ModelContract.Type>();
  for (const entry of Array.dedupe(entries)) {
    const url = yield* path.toFileUrl(entry);
    const loaded: unknown = yield* Effect.tryPromise({
      try: () => import(url.href),
      catch: (cause) => DiagramError.make({ message: `Cannot import ${entry}`, cause }),
    });
    const exports = yield* Schema.decodeUnknownEffect(Schema.Record(Schema.String, Schema.Unknown))(
      loaded,
    );
    let found = false;
    for (const [exportName, value] of Record.toEntries(exports)) {
      if (!Predicate.hasProperty(value, "kind") || value.kind !== "Model") continue;
      const model = yield* Schema.decodeUnknownEffect(ModelContract)(value).pipe(
        Effect.mapError((cause) =>
          DiagramError.make({ message: `Invalid model export ${exportName} in ${entry}`, cause }),
        ),
      );
      found = true;
      if (seen.has(model)) continue;
      seen.add(model);
      catalog.push({ path: entry, exportName, model });
    }
    if (!found)
      return yield* DiagramError.make({ message: `No exported Domain.Model in ${entry}` });
  }
  return catalog;
});

export const filterModels = Effect.fn("filterModels")(function* (
  catalog: readonly ModelEntry[],
  modelName: Option.Option<string>,
) {
  if (Option.isNone(modelName)) return catalog;
  const matches = Array.filter(catalog, ({ model }) => model.modelName === modelName.value);
  if (matches.length !== 1) {
    return yield* DiagramError.make({
      message:
        matches.length === 0
          ? `Unknown model: ${modelName.value}. Available: ${Array.join(
              Array.map(catalog, ({ model }) => model.modelName),
              ", ",
            )}`
          : `Ambiguous model: ${modelName.value}. Use --entry to select a module: ${Array.join(
              Array.map(matches, ({ path }) => path),
              ", ",
            )}`,
    });
  }
  return matches;
});

/** Repeated membership is not ambiguity; different owning aggregates are. */
export const selectAggregate = Effect.fn("selectAggregate")(function* (
  catalog: readonly ModelEntry[],
  selector: { readonly kind: "command" | "aggregate"; readonly name: string },
) {
  const matches = new Map<AggregateContract, AggregateSelection>();
  const available = new Set<string>();
  for (const entry of catalog) {
    for (const [index, aggregate] of entry.model.aggregates.entries()) {
      const names =
        selector.kind === "aggregate"
          ? [aggregate.aggregateName]
          : Array.map(aggregate.definition.commands, (command) => command.tag);
      for (const name of names) available.add(name);
      if (Array.contains(names, selector.name)) matches.set(aggregate, { entry, index, aggregate });
    }
  }
  const selection = Option.getOrUndefined(Option.fromIterable(matches.values()));
  if (matches.size !== 1 || selection === undefined) {
    return yield* DiagramError.make({
      message:
        matches.size === 0
          ? `Unknown ${selector.kind}: ${selector.name}. Available: ${Array.join(Array.fromIterable(available), ", ")}`
          : `Ambiguous ${selector.kind}: ${selector.name}. Use --model or --entry. Matches: ${Array.join(
              Array.map(
                Array.fromIterable(matches.values()),
                ({ entry, aggregate }) =>
                  `${entry.model.modelName}/${aggregate.aggregateName} (${entry.path})`,
              ),
              ", ",
            )}`,
    });
  }
  return selection;
});
