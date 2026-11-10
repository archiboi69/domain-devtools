# Domain Devtools

Generate Mermaid command diagrams and aggregate state overviews from Alchemy Domain models.

## Setup

Install [Vite+](https://viteplus.dev/guide/). Use a Node.js version within the range in [package.json](package.json).

```sh
git clone https://github.com/archiboi69/domain-devtools.git
cd domain-devtools
vp install --frozen-lockfile
```

## Generate a diagram

**Use trusted local modules only.** The CLI imports each configured entry and executes its module-level code. It is not a sandbox. Output can contain application source. Entry modules must not write application logs to stdout.

Install your application's dependencies first. Run the CLI from that application's directory. The application must have a TypeScript configuration. Each entry must export at least one `Domain.Model`. The tool does not start model runtimes or scan the repository for modules.

Create `domain-devtools.json` in the application directory:

```json
{
  "entries": ["src/bank.model.ts", "src/billing.model.ts"]
}
```

Entry paths are relative to the configuration file. Use `--config <file>` for a different configuration file. Use `--entry <module>` to replace the configured entries for one invocation. An explicit entry path is relative to the current directory.

```sh
cd /path/to/your-application

# One command diagram
vpx /path/to/domain-devtools/src/cli.ts command RequestTransfer > request-transfer.md

# One aggregate state overview with self-loops
vpx /path/to/domain-devtools/src/cli.ts aggregate states Transfer > transfer-states.md

# Discover available names
vpx /path/to/domain-devtools/src/cli.ts models
vpx /path/to/domain-devtools/src/cli.ts commands
vpx /path/to/domain-devtools/src/cli.ts aggregates
```

Selectors use Domain names: `modelName`, command `tag`, and `aggregateName`. Export aliases do not change these names. Shared aggregate membership does not require a model argument. If different owners have the same name, use `--model <name>` to select the model. Use `--entry` if model names also conflict.

Diagrams and name lists go to stdout. Diagnostics go to stderr. Import, selection, and extraction failures return a nonzero exit status. Partial state analysis returns a report and a warning. Add `--strict` to `aggregate states` to fail without diagram output when analysis gaps remain. A shell redirect can still create or truncate its destination file on failure.

Open the output with tkmp or a Mermaid-compatible Markdown viewer:

```sh
tkmp transfer-states.md
```

tkmp can change wide diagrams to a vertical layout. For CLI options, run:

```sh
vpx /path/to/domain-devtools/src/cli.ts --help
```

Inspect the output before you share it.

## Read the output

### Command diagrams

Each diagram shows a command and its declared events and rejections. A diamond marks `decide`. Subroutine boxes mark `evolve`. Original handler source appears in TypeScript code blocks below the diagram. Commands are blue, events are orange, and rejections are red. Text labels also identify each type.

Declared outcomes are contract possibilities, not proven paths. The accepted no-op edge does not prove that the handler returns no events. INPUT STATE and OUTPUT STATE list the declared aggregate states, or a schema description for an untagged state. These lists do not identify event-specific destinations.

### State overviews

Each node is a declared top-level state tag. Each arrow has exactly one event label and a transition number. The number matches the `#` column in its evidence row: #, From, Command, Event, To. The same event in different transitions has different numbers. Numbers do not indicate execution order. Same-tag transitions always appear as self-loops.

Arrows are static candidates, not observed transitions or proof of reachability. **Unresolved paths** identify gaps in the analysis. Missing arrows can reflect those gaps rather than absent domain behavior. No reported gaps is not a guarantee of complete analysis.

The state view does not invent nodes for nested blockers or status fields. An untagged or mixed state schema produces a report instead of a state graph. The command view can still show a schema description.

Neither view executes commands or captures Stories. Unsupported table or handler forms can stop extraction with an error. Model types must retain the aggregate tuple. Aggregate members must resolve to named class declarations with literal aggregate names.

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
vpx src/cli.ts --entry src/catalog.fixture.ts command Increase > /tmp/counter.md
vpx src/cli.ts --entry src/catalog.fixture.ts aggregate states Lifecycle > /tmp/lifecycle.md
```

If tkmp is available, verify both outputs:

```sh
tkmp bench /tmp/counter.md
tkmp bench /tmp/lifecycle.md
```
