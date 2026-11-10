# Domain Devtools

Inspect Alchemy Domain aggregate contracts and generate source-backed Mermaid diagrams.

The tool produces command diagrams and aggregate state overviews. Each command diagram shows input state tags, command fields, the actual `decide` source, declared events and rejections, and the actual `evolve` source. Commands are blue, events are orange, and rejections are red. Labels also identify each node type.

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

## State overview

Select the state view to trace supported decision paths through event arrays and evolution handlers:

```sh
vpx /path/to/domain-devtools/src/cli.ts --view states \
  src/account/account.aggregate.ts Account /tmp/account-states.md
```

Each node is a declared top-level `_tag`. Each arrow has exactly one event label. Different events between the same states have separate arrows. Commands appear in the evidence table below the graph. Add `--include-self-loops` to include same-tag updates in the graph; the table always includes them.

This is bounded static analysis, not execution or a reachability proof. It supports explicit tag comparisons, boolean guards, conditionals, early returns, tag switches, root aliases, and `Effect.gen` returns. Other guards remain unknown. Required schema literals can rule out impossible branches without becoming state nodes. The compiler supplies singleton event tags, including typed event helper results. Evolution reads explicit returned tags and typed object spreads. Effect optics built with `id`, `tag`, and literal `key` focus support `replace` and `modify`: non-tag field updates preserve the root tag, while whole-root replacements and modification callbacks are analyzed. Direct `_tag` focus and unsupported optic compositions remain explicit gaps. Conditional `_tag` expressions contribute each distinct literal destination as a static candidate; an unknown branch remains an explicit gap. Multiple events in one array evolve in order through every resolved destination.

Unsupported paths appear under **Unresolved paths**, outside the diagram. Local plain and Effect helpers can preserve root identity and narrow root tags through positional arguments. Tagged failure branches stay separate from successful returned state. Recursive calls have a depth limit. Nested state selection, reassigned state aliases, loops, arbitrary wrappers, and ambiguous helper-returned states require more analysis. Partial diagrams remain partial. Untagged schemas produce a report rather than invented states based on fields such as `status`.

## What the command diagram means

Runtime metadata supplies state tags, command fields, declared events, and declared rejections. The TypeScript compiler supplies handler source and resolves imported references, aliases, object spreads, and property overrides.

A declared event is a contract possibility, not proof of a reachable code path. The accepted no-op edge describes the aggregate contract; it does not claim that the handler contains a literal `return []`. The resulting state remains unspecified until execution supplies a concrete result.

The tool does not evaluate arbitrary business guards, infer substates, or execute commands. It does not yet capture Stories, highlight execution paths, inspect live instances, or provide a browser interface.

## Compatibility and limits

The tool uses Effect 4 schema metadata and the TypeScript 7.1.0-beta compiler API (`typescript/sync` and `typescript/ast`). The current runtime contract was exercised with Alchemy Domain 2.0.0-beta.85. Other versions require verification.

- The module must export a locally declared aggregate class with `decide` and `evolve` tables.
- Tables can use imported object literals and spreads. Later properties override earlier properties.
- Handlers can be arrow functions, function expressions, referenced function declarations, `Effect.fn(body)`, `Effect.fn("name")(body)`, `Effect.fnUntraced(body)`, or `Effect.fnUntracedEager(body)`. Namespace imports, named import aliases, and aliases of the Effect function export resolve through compiler symbols. The command view preserves the original wrapper source.
- State analysis supports generator bodies, `Effect.gen`, and explicit `Effect.succeed` returns. Additional `Effect.fn` result transforms or `self` binding remain unresolved because the callback alone does not determine the result. Zero-argument handlers can return a constant state.
- Dynamic keys, method shorthand, factory-generated tables, and unrecognized handler wrappers are not supported. Unsupported table or handler source produces an error, not guessed code.
- The target project must have a TypeScript configuration and dependencies that its runtime loader can resolve.
- Non-tagged or mixed state schemas have a schema-description fallback rather than invented state tags.

**Use trusted local modules only.** The CLI imports the aggregate module to read its contracts. This executes module-level code and imports. It is not a sandbox. Generated output includes application source; inspect it before you share it.

## Development

Use `vp run check`, `vp test run`, and `vp run build` before submitting changes. The check command runs the antipattern, correctness, Effect-native, style, and strict Effect lint presets through the Effect-tsgo TSRS wrapper. The install-time `prepare` step patches local tools and Oxlint configuration types for direct commands and editors. The CLI uses `effect/cli` for argument validation, help, and completions. `vp pack` produces the CLI under `dist/` and leaves runtime dependencies external. Continue to use `vpx` when the target application imports TypeScript source.

`cli.ts` handles local input/output, `source.ts` resolves handler nodes inside the compiler resource lifetime, and `diagram.ts` validates metadata and renders command diagrams. `state-flow.ts` analyzes supported tag-level control flow; `state-diagram.ts` joins decisions to evolution and renders state overviews. Tests use small synthetic aggregates. Application code, credentials, and generated application diagrams do not belong in this repository.
