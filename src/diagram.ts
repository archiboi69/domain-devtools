import {
  Array,
  Function,
  Option,
  Predicate,
  Record,
  Schema,
  SchemaAST,
  SchemaRepresentation,
  String as Str,
} from "effect";
import type { StateTransition } from "./state-diagram";

// Validate callable metadata only; this tool never invokes business handlers.
const Handler = Schema.declare<() => void>((value): value is () => void =>
  Predicate.isFunction(value),
);
const RuntimeSchema = Schema.declare<Schema.Top>(Schema.isSchema);
const EventContract = Schema.declare<{ readonly tag: string }>(
  (value): value is { readonly tag: string } =>
    Predicate.hasProperty(value, "tag") && Predicate.isString(value.tag),
);
const CommandFields = Schema.Struct({
  tag: Schema.String,
  fields: Schema.Record(Schema.String, RuntimeSchema),
  events: Schema.Array(EventContract),
  rejects: Schema.Array(EventContract),
});
const CommandContract = Schema.declare<typeof CommandFields.Type>(
  (value): value is typeof CommandFields.Type =>
    Predicate.hasProperty(value, "tag") &&
    Predicate.hasProperty(value, "fields") &&
    Predicate.hasProperty(value, "events") &&
    Predicate.hasProperty(value, "rejects") &&
    Schema.is(CommandFields)({
      tag: value.tag,
      fields: value.fields,
      events: value.events,
      rejects: value.rejects,
    }),
);
const AggregateFields = Schema.Struct({
  aggregateName: Schema.String,
  definition: Schema.Struct({
    state: RuntimeSchema,
    initial: Schema.optional(Schema.Unknown),
    commands: Schema.Array(CommandContract),
    decide: Schema.Record(Schema.String, Handler),
    evolve: Schema.Record(Schema.String, Handler),
  }),
});
export const AggregateContract = Schema.declare<typeof AggregateFields.Type>(
  (value): value is typeof AggregateFields.Type =>
    Predicate.hasProperty(value, "aggregateName") &&
    Predicate.hasProperty(value, "definition") &&
    Schema.is(AggregateFields)({
      aggregateName: value.aggregateName,
      definition: value.definition,
    }),
);
export type AggregateContract = typeof AggregateContract.Type;

export interface HandlerSource {
  readonly decide: ReadonlyMap<string, string>;
  readonly evolve: ReadonlyMap<string, string>;
}

export interface CommandStateAnalysis {
  readonly inputs: readonly string[];
  readonly transitions: readonly StateTransition[];
  readonly unresolved: readonly string[];
}

export interface CommandDiagramSource {
  readonly handlers: HandlerSource;
  readonly states: ReadonlyMap<string, CommandStateAnalysis>;
}

export function stateTags(ast: SchemaAST.AST): readonly string[] {
  const members = SchemaAST.isUnion(ast) ? ast.types : [ast];
  const tags = Array.map(members, (member) => {
    if (!SchemaAST.isObjects(member)) return Option.none<string>();
    return Array.findFirst(member.propertySignatures, (property) => property.name === "_tag").pipe(
      Option.flatMap((tag) =>
        SchemaAST.isLiteral(tag.type) && Predicate.isString(tag.type.literal)
          ? Option.some(tag.type.literal)
          : Option.none<string>(),
      ),
    );
  });
  // Do not invent a discriminant for untagged or mixed schemas.
  return Option.getOrElse(Option.all(tags), () => []);
}

function describeState(state: Schema.Top): string {
  const ast = Schema.toType(state).ast;
  const tags = stateTags(ast);
  if (tags.length > 0) return Array.join(tags, "\n");
  const document = SchemaRepresentation.toCodeDocument(
    SchemaRepresentation.toRepresentations([ast]),
  );
  return Array.join(
    [
      ...Array.map(document.codes, (code) => code.runtime),
      ...Array.map(
        document.references.nonRecursives,
        ({ $ref, code }) => `${$ref} = ${code.runtime}`,
      ),
      ...Array.map(
        Record.toEntries(document.references.recursives),
        ([name, code]) => `${name} = ${code.runtime}`,
      ),
    ],
    "\n",
  );
}

function label(value: string): string {
  return Function.pipe(
    value,
    Str.replaceAll("#", "#35;"),
    Str.replaceAll("&", "#38;"),
    Str.replaceAll('"', "#quot;"),
    Str.replaceAll("<", "#60;"),
    Str.replaceAll(">", "#62;"),
    Str.replaceAll("\r", ""),
    Str.replaceAll("\n", "<br/>"),
  );
}

function node(id: string, text: string): string {
  return `    ${id}["${label(text)}"]`;
}

function codeBlock(source: string): string {
  let fence = "```";
  while (Str.includes(fence)(source)) fence += "`";
  return `${fence}typescript\n${source}\n${fence}`;
}

/** Contract edges describe possibilities, not proven control flow or reachability. */
function renderCommands(
  aggregate: AggregateContract,
  commands: AggregateContract["definition"]["commands"],
  source: CommandDiagramSource,
): string {
  const tagged = stateTags(Schema.toType(aggregate.definition.state).ast).length > 0;
  const schemaDescription = tagged ? undefined : describeState(aggregate.definition.state);
  const sections = [`# ${aggregate.aggregateName}`];
  for (const command of commands) {
    const analysis = source.states.get(command.tag);
    if (analysis === undefined) throw new Error(`Missing state analysis: ${command.tag}`);
    const candidates = (states: readonly string[]): string => {
      if (schemaDescription !== undefined) return schemaDescription;
      return Array.join(Array.dedupe(states), "\n");
    };
    const decision = source.handlers.decide.get(command.tag);
    if (decision === undefined) throw new Error(`Missing decide source: ${command.tag}`);
    const handlers = [`### decide — ${command.tag}`, codeBlock(decision)];
    const lines = [
      "```mermaid",
      "flowchart LR",
      "    classDef command fill:#dbeafe,stroke:#2563eb,color:#172554",
      "    classDef event fill:#dcfce7,stroke:#16a34a,color:#14532d",
      "    classDef rejection fill:#fee2e2,stroke:#dc2626,color:#450a0a",
      node("B", `input state\n${candidates(analysis.inputs)}`),
      node(
        "C",
        `COMMAND: ${command.tag}\n${Function.pipe(
          Record.keys(command.fields),
          Array.filter((field) => field !== "_tag"),
          Array.join("\n"),
        )}`,
      ),
      "    class C command",
      '    D{"decide"}',
      "    B --> D",
      "    C --> D",
      node("N", "No events"),
      '    D -.->|"no-op"| N',
    ];
    for (const [index, event] of command.events.entries()) {
      const evolution = source.handlers.evolve.get(event.tag);
      if (evolution === undefined) throw new Error(`Missing evolve source: ${event.tag}`);
      handlers.push(`### evolve — ${event.tag}`, codeBlock(evolution));
      lines.push(
        node(`E${index}`, `EVENT: ${event.tag}`),
        `    class E${index} event`,
        `    V${index}[["${label(`evolve\n${event.tag}`)}"]]`,
        node(
          `S${index}`,
          `output state\n${candidates(
            Array.map(
              Array.filter(analysis.transitions, (transition) => transition.event === event.tag),
              (transition) => transition.to,
            ),
          )}`,
        ),
        `    D -.->|emits| E${index}`,
        `    E${index} --> V${index}`,
        `    B -->|from| V${index}`,
        `    V${index} -->|to| S${index}`,
      );
    }
    for (const [index, rejection] of command.rejects.entries()) {
      lines.push(
        node(`R${index}`, `REJECTION: ${rejection.tag}`),
        `    class R${index} rejection`,
        `    D -.->|rejects| R${index}`,
      );
    }
    lines.push("```");
    sections.push(`## ${command.tag}`, Array.join(lines, "\n"));
    if (tagged && analysis.unresolved.length > 0) {
      sections.push(
        "### Analysis gaps",
        Array.join(
          Array.map(analysis.unresolved, (reason) => `- ${reason}`),
          "\n",
        ),
      );
    }
    sections.push(...handlers);
  }
  return `${Array.join(sections, "\n\n")}\n`;
}

export const renderCommand: {
  (commandTag: string, source: CommandDiagramSource): (aggregate: AggregateContract) => string;
  (aggregate: AggregateContract, commandTag: string, source: CommandDiagramSource): string;
} = Function.dual(
  3,
  (aggregate: AggregateContract, commandTag: string, source: CommandDiagramSource): string => {
    const command = Option.getOrUndefined(
      Array.findFirst(aggregate.definition.commands, (command) => command.tag === commandTag),
    );
    if (command === undefined) throw new Error(`Unknown command: ${commandTag}`);
    return renderCommands(aggregate, [command], source);
  },
);

export const renderAggregateCommands: {
  (source: CommandDiagramSource): (aggregate: AggregateContract) => string;
  (aggregate: AggregateContract, source: CommandDiagramSource): string;
} = Function.dual(2, (aggregate: AggregateContract, source: CommandDiagramSource): string =>
  renderCommands(aggregate, aggregate.definition.commands, source),
);
