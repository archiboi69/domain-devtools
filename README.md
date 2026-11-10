# Domain Devtools

Generate Mermaid command diagrams and state overviews from Alchemy Domain aggregates.

## Setup

Install [Vite+](https://viteplus.dev/guide/). Use a Node.js version within the range in [package.json](package.json).

```sh
git clone https://github.com/archiboi69/domain-devtools.git
cd domain-devtools
vp install --frozen-lockfile
```

## Generate a diagram

**Use trusted local modules only.** The CLI imports the target module and executes its module-level code. It is not a sandbox. Output can contain application source.

Install your application's dependencies first. Run the CLI from that application's directory. The target must have a TypeScript configuration and export a locally declared aggregate class.

```sh
cd /path/to/your-application

# Command diagrams
vpx /path/to/domain-devtools/src/cli.ts aggregate commands \
  src/account/account.aggregate.ts Account /tmp/account-commands.md

# State overview with self-loops
vpx /path/to/domain-devtools/src/cli.ts aggregate states \
  src/account/account.aggregate.ts Account /tmp/account-states.md
```

The positional arguments are the module path, exported class name, and output Markdown path. Relative paths use the current directory. The output directory must exist. If the output file exists, the CLI replaces it.

Open the output with tkmp or a Mermaid-compatible Markdown viewer:

```sh
tkmp /tmp/account-states.md
```

tkmp can change wide diagrams to a vertical layout. For CLI options, run:

```sh
vpx /path/to/domain-devtools/src/cli.ts --help
```

Inspect the output before you share it.

## Read the output

### Command diagrams

Each diagram shows a command, its handler source, and its declared events and rejections. Commands are blue, events are orange, and rejections are red. Text labels also identify each type.

Declared outcomes are contract possibilities, not proven paths. The accepted no-op edge does not prove that the handler returns no events. The command view leaves the output state unspecified.

### State overviews

Each node is a declared top-level state tag. Each arrow has exactly one numbered event label. The same event has the same number in the graph and evidence table. Numbers identify event types within an aggregate, not execution order. The evidence table identifies the associated commands. Same-tag transitions always appear as self-loops.

Arrows are static candidates, not observed transitions or proof of reachability. **Unresolved paths** identify gaps in the analysis. Missing arrows can reflect those gaps rather than absent domain behavior. No reported gaps is not a guarantee of complete analysis.

The state view does not invent nodes for nested blockers or status fields. An untagged or mixed state schema produces a report instead of a state graph. The command view can still show a schema description.

Neither view executes commands or captures Stories. Unsupported table or handler forms can stop extraction with an error.

## Development

Use TypeScript, Effect, and Vite+. Read [AGENTS.md](AGENTS.md) for contribution rules.

Run these checks before you complete a change:

```sh
vp run check
vp test run
vp run build
```

Use `vp run check` for the TSRS-backed Effect check. The install-time `prepare` step patches local tools and configuration types for editors and direct commands.

For a smoke test without an application, run:

```sh
vp run diagram aggregate commands src/diagram.fixture.ts Counter /tmp/counter.md
vp run diagram aggregate states \
  src/state-diagram.fixture.ts Lifecycle /tmp/lifecycle.md
```

If tkmp is available, verify both outputs:

```sh
tkmp bench /tmp/counter.md
tkmp bench /tmp/lifecycle.md
```
