import {
  Array,
  Function,
  Option,
  Predicate,
  Record,
  Schema,
  SchemaAST,
  String as Str,
} from "effect";

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

/** Contract edges describe possibilities, not proven control flow or reachability. */
export const renderAggregate: {
  (source: HandlerSource): (aggregate: AggregateContract) => string;
  (aggregate: AggregateContract, source: HandlerSource): string;
} = Function.dual(2, (aggregate: AggregateContract, source: HandlerSource): string => {
  const { definition } = aggregate;
  const tags = stateTags(definition.state.ast);
  const inputState = tags.length > 0 ? Array.join(tags, "\n") : String(definition.state.ast);
  const sections = [
    `# ${aggregate.aggregateName}`,
    "Declared outcomes; no reachability inferred. Handler code is source, not an execution trace.",
  ];
  for (const command of definition.commands) {
    const decision = source.decide.get(command.tag);
    if (decision === undefined) throw new Error(`Missing decide source: ${command.tag}`);
    const lines = [
      "```mermaid",
      "flowchart LR",
      "    classDef command fill:#dbeafe,stroke:#2563eb,color:#172554",
      "    classDef event fill:#ffedd5,stroke:#ea580c,color:#431407",
      "    classDef rejection fill:#fee2e2,stroke:#dc2626,color:#450a0a",
      "    class C command",
      node("B", `INPUT STATE\n${inputState}`),
      node(
        "C",
        `COMMAND: ${command.tag}\n${Function.pipe(
          Record.keys(command.fields),
          Array.filter((field) => field !== "_tag"),
          Array.join("\n"),
        )}`,
      ),
      node("D", `decide\n${decision}`),
      "    B --> D",
      "    C --> D",
      node("N", "No events\nState unchanged"),
      '    D -.->|"accepted no-op contract"| N',
    ];
    for (const [index, event] of command.events.entries()) {
      const evolution = source.evolve.get(event.tag);
      if (evolution === undefined) throw new Error(`Missing evolve source: ${event.tag}`);
      lines.push(
        node(`E${index}`, `EVENT: ${event.tag}`),
        `    class E${index} event`,
        node(`V${index}`, `evolve\n${evolution}`),
        node(`S${index}`, "Resulting state"),
        `    D -.->|declared event| E${index}`,
        `    E${index} --> V${index}`,
        `    B -->|previous state| V${index}`,
        `    V${index} --> S${index}`,
      );
    }
    for (const [index, rejection] of command.rejects.entries()) {
      lines.push(
        node(`R${index}`, `REJECTION: ${rejection.tag}\nState unchanged`),
        `    class R${index} rejection`,
        `    D -.->|declared rejection| R${index}`,
      );
    }
    lines.push("```");
    sections.push(`## ${command.tag}`, Array.join(lines, "\n"));
  }
  return `${Array.join(sections, "\n\n")}\n`;
});
