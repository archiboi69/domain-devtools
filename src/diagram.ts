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
export const renderCommand: {
  (commandTag: string, source: HandlerSource): (aggregate: AggregateContract) => string;
  (aggregate: AggregateContract, commandTag: string, source: HandlerSource): string;
} = Function.dual(
  3,
  (aggregate: AggregateContract, commandTag: string, source: HandlerSource): string => {
    const { definition } = aggregate;
    const command = Option.getOrUndefined(
      Array.findFirst(definition.commands, (command) => command.tag === commandTag),
    );
    if (command === undefined) throw new Error(`Unknown command: ${commandTag}`);
    const stateDescription = describeState(definition.state);
    const sections = [
      `# ${aggregate.aggregateName}`,
      "Declared outcomes; no reachability inferred. Handler code is source, not an execution trace.",
    ];
    const decision = source.decide.get(command.tag);
    if (decision === undefined) throw new Error(`Missing decide source: ${command.tag}`);
    const handlers = [`### decide — ${command.tag}`, codeBlock(decision)];
    const lines = [
      "```mermaid",
      "flowchart LR",
      "    classDef command fill:#dbeafe,stroke:#2563eb,color:#172554",
      "    classDef event fill:#dcfce7,stroke:#16a34a,color:#14532d",
      "    classDef rejection fill:#fee2e2,stroke:#dc2626,color:#450a0a",
      "    class C command",
      node("B", `INPUT STATE\n${stateDescription}`),
      node(
        "C",
        `COMMAND: ${command.tag}\n${Function.pipe(
          Record.keys(command.fields),
          Array.filter((field) => field !== "_tag"),
          Array.join("\n"),
        )}`,
      ),
      '    D{"decide"}',
      "    B --> D",
      "    C --> D",
      node("N", "No events\nState unchanged"),
      '    D -.->|"accepted no-op contract"| N',
    ];
    for (const [index, event] of command.events.entries()) {
      const evolution = source.evolve.get(event.tag);
      if (evolution === undefined) throw new Error(`Missing evolve source: ${event.tag}`);
      handlers.push(`### evolve — ${event.tag}`, codeBlock(evolution));
      lines.push(
        node(`E${index}`, `EVENT: ${event.tag}`),
        `    class E${index} event`,
        `    V${index}[["${label(`evolve\n${event.tag}`)}"]]`,
        node(`S${index}`, `OUTPUT STATE\n${stateDescription}`),
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
    sections.push(`## ${command.tag}`, Array.join(lines, "\n"), ...handlers);
    return `${Array.join(sections, "\n\n")}\n`;
  },
);
