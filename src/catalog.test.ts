import { NodeServices } from "@effect/platform-node";
import { Array, Effect, FileSystem, Option, Path, Schema } from "effect";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { filterModels, loadCatalog, selectAggregate } from "./catalog";
import { readAggregateLocation } from "./source";

const fixture = fileURLToPath(new URL("catalog.fixture.ts", import.meta.url));
const other = fileURLToPath(new URL("catalog-ambiguous.fixture.ts", import.meta.url));
const load = (entry: string) => loadCatalog({ config: "unused.json", entry: Option.some(entry) });

// The same configuration format drives discovery from a different working directory.
const configuration = Schema.fromJsonString(
  Schema.Struct({ entries: Schema.Array(Schema.String) }),
);

describe("model discovery", () => {
  it("deduplicates export aliases and shared membership, and resolves imported aggregate source", () =>
    Effect.gen(function* () {
      const catalog = yield* load(fixture);
      expect(Array.map(catalog, ({ model }) => model.modelName)).toEqual(["Primary", "Secondary"]);
      const selection = yield* selectAggregate(catalog, { kind: "command", name: "Increase" });
      const location = yield* readAggregateLocation({
        path: selection.entry.path,
        exportName: selection.entry.exportName,
        index: selection.index,
        aggregateName: selection.aggregate.aggregateName,
      });
      expect(location).toEqual({
        path: fileURLToPath(new URL("diagram.fixture.ts", import.meta.url)),
        exportName: "Counter",
      });
      const aggregate = yield* selectAggregate(catalog, { kind: "aggregate", name: "Counter" });
      expect(aggregate.aggregate).toBe(selection.aggregate);
      const reexported = yield* load(
        fileURLToPath(new URL("catalog-barrel.fixture.ts", import.meta.url)),
      );
      const start = yield* selectAggregate(reexported, { kind: "command", name: "Start" });
      const lifecycle = yield* readAggregateLocation({
        path: start.entry.path,
        exportName: start.entry.exportName,
        index: start.index,
        aggregateName: start.aggregate.aggregateName,
      });
      expect(lifecycle).toEqual({
        path: fileURLToPath(new URL("state-diagram.fixture.ts", import.meta.url)),
        exportName: "Lifecycle",
      });
    }).pipe(Effect.provide(NodeServices.layer), Effect.runPromise));

  it("resolves configuration paths relative to the config and requires a filter for different owners", () =>
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped();
      const config = path.join(directory, "domain-devtools.json");
      const text = yield* Schema.encodeEffect(configuration)({
        entries: [
          path.relative(directory, fixture),
          path.relative(directory, other),
          path.relative(directory, fixture),
        ],
      });
      yield* fs.writeFileString(config, text);
      const catalog = yield* loadCatalog({ config, entry: Option.none() });
      expect(catalog).toHaveLength(3);
      for (const kind of ["command", "aggregate"] as const) {
        const name = kind === "command" ? "Increase" : "Counter";
        const error = yield* selectAggregate(catalog, { kind, name }).pipe(Effect.flip);
        expect(error.message).toContain(`Ambiguous ${kind}`);
        expect(error.message).toContain("--model");
        const models = yield* filterModels(catalog, Option.some("Other"));
        const selection = yield* selectAggregate(models, { kind, name });
        expect(selection.entry.model.modelName).toBe("Other");
      }
      const missing = yield* selectAggregate(catalog, { kind: "command", name: "Missing" }).pipe(
        Effect.flip,
      );
      expect(missing.message).toContain("Available:");
      expect(missing.message).toContain("Increase");
      const model = yield* filterModels(catalog, Option.some("Missing")).pipe(Effect.flip);
      expect(model.message).toContain("Unknown model");
      const overridden = yield* loadCatalog({
        config: "does-not-exist.json",
        entry: Option.some(fixture),
      });
      expect(overridden).toHaveLength(2);
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise));

  it("fails on modules without models and malformed configuration", () =>
    Effect.gen(function* () {
      const noModel = yield* load(
        fileURLToPath(new URL("diagram.fixture.ts", import.meta.url)),
      ).pipe(Effect.flip);
      expect(noModel.message).toContain("No exported Domain.Model");
      const fs = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const directory = yield* fs.makeTempDirectoryScoped();
      const config = path.join(directory, "invalid.json");
      yield* fs.writeFileString(config, '{"entries":[]}');
      const invalid = yield* loadCatalog({ config, entry: Option.none() }).pipe(Effect.flip);
      expect(invalid.message).toContain("Invalid configuration");
    }).pipe(Effect.scoped, Effect.provide(NodeServices.layer), Effect.runPromise));
});
