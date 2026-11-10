# Domain Devtools

Inspect Alchemy Domain aggregate contracts and generate source-backed Mermaid diagrams.

The current tool produces one diagram per command. Each diagram shows input state tags, command fields, the actual `decide` source, declared events and rejections, and the actual `evolve` source. Commands are blue, events are orange, and rejections are red. Labels also identify each node type.

## Setup

Install [Vite+](https://viteplus.dev/guide/), with Node.js 26.8.1 or a later Node.js 26 release.

```sh
git clone https://github.com/archiboi69/domain-devtools.git
cd domain-devtools
vp install --frozen-lockfile
vp run check
vp test run
vp run build
```

The repository is public. The package is not published to npm.

## Generate a diagram

Run the CLI from your application's project directory. Install that application's dependencies first.

```sh
cd /path/to/your-application
vpx /path/to/domain-devtools/src/cli.ts \
  src/account/account.aggregate.ts \
  Account \
  /tmp/account.md
```

The arguments are the aggregate module path, its exported class name, and the output Markdown path. Relative paths use the current directory. The output directory must exist. The command replaces an existing output file.

To preview with tkmp, run:

```sh
tkmp /tmp/account.md
```

A Mermaid-compatible Markdown viewer also works. tkmp can change wide diagrams to a vertical layout to keep text readable.

For a self-contained smoke test, use the structural test fixture:

```sh
vp run diagram src/diagram.fixture.ts Counter /tmp/counter.md
```

This fixture exercises the metadata interface without an application or external services.

## What the diagram means

Runtime metadata supplies state tags, command fields, declared events, and declared rejections. The TypeScript compiler supplies handler source and resolves imported references, aliases, object spreads, and property overrides.

A declared event is a contract possibility, not proof of a reachable code path. The accepted no-op edge describes the aggregate contract; it does not claim that the handler contains a literal `return []`. The resulting state remains unspecified until execution supplies a concrete result.

The tool does not interpret business guards, infer substates, or execute commands. It does not yet capture Stories, highlight execution paths, inspect live instances, or provide a browser interface.

## Compatibility and limits

The tool uses Effect 4 schema metadata and the TypeScript 7.1.0-beta compiler API (`typescript/sync` and `typescript/ast`). The current runtime contract was exercised with Alchemy Domain 2.0.0-beta.85. Other versions require verification.

- The module must export a locally declared aggregate class with `decide` and `evolve` tables.
- Tables can use imported object literals and spreads. Later properties override earlier properties.
- Handlers can be arrow functions, function expressions, or referenced function declarations.
- Dynamic keys, method shorthand, factory-generated tables, and handler wrappers such as `Effect.fn(...)` are not supported. Unsupported source produces an error, not guessed code.
- The target project must have a TypeScript configuration and dependencies that its runtime loader can resolve.
- Non-tagged or mixed state schemas have a schema-description fallback rather than invented state tags.

**Use trusted local modules only.** The CLI imports the aggregate module to read its contracts. This executes module-level code and imports. It is not a sandbox. Generated output includes application source; inspect it before you share it.

## Development

Use `vp run check`, `vp test run`, and `vp run build` before submitting changes. The check command runs the antipattern, correctness, Effect-native, style, and strict Effect lint presets through the Effect-tsgo TSRS wrapper. The install-time `prepare` step patches local tools and Oxlint configuration types for direct commands and editors. The CLI uses `effect/cli` for argument validation, help, and completions. `vp pack` produces the CLI under `dist/` and leaves runtime dependencies external. Continue to use `vpx` when the target application imports TypeScript source.

The source has three parts: `cli.ts` handles local input/output, `source.ts` extracts handler source, and `diagram.ts` validates metadata and renders Mermaid. Tests use small synthetic aggregates. Application code, credentials, and generated application diagrams do not belong in this repository.
