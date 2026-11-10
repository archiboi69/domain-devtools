import { Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { fileURLToPath } from "node:url";
import {
  AggregateContract,
  type CommandDiagramSource,
  type HandlerSource,
  renderCommand,
  stateTags,
} from "./diagram";
import { Counter } from "./diagram.fixture";
import { readHandlerSource } from "./source";
import { readCommandDiagramSource } from "./state-diagram";

const fixture = fileURLToPath(new URL("diagram.fixture.ts", import.meta.url));

function formattingSource(handlers: HandlerSource): CommandDiagramSource {
  return {
    handlers,
    states: new Map([
      [
        "Increase",
        {
          inputs: [],
          transitions: [],
          unresolved: [],
        },
      ],
    ]),
  };
}

describe("aggregate diagrams", () => {
  it("derives all command outcomes from runtime metadata and original source", () =>
    Effect.gen(function* () {
      const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(Counter);
      const source = yield* readCommandDiagramSource({
        path: fixture,
        exportName: "Counter",
        aggregate,
      });
      const markdown = renderCommand(aggregate, "Increase", source);
      expect(markdown).toContain("input state<br/>Empty<br/>Counting");
      expect(markdown).toContain("COMMAND: Increase<br/>amount");
      expect(markdown).toContain("EVENT: Increased");
      expect(markdown).toContain("REJECTION: Limited");
      // tkmp applies classes only to nodes already declared.
      expect(markdown).toContain('C["COMMAND: Increase<br/>amount"]\n    class C command');
      expect(markdown).not.toContain("State unchanged");
      expect(markdown).toContain("class E0 event");
      expect(markdown).toContain("classDef command fill:#dbeafe,stroke:#2563eb,color:#172554");
      expect(markdown).toContain("classDef event fill:#dcfce7,stroke:#16a34a,color:#14532d");
      expect(markdown).toContain("class R0 rejection");
      expect(markdown).toContain("D -.->|rejects| R0");
      expect(markdown).toContain("D -.->|emits| E0");
      expect(markdown).not.toContain("Declared outcomes;");
      expect(markdown).toContain("output state<br/>Counting");
      expect(markdown).not.toContain("Resulting state");
      expect(markdown).toContain("no-op");
      expect(markdown).not.toContain("return []");
      expect(markdown).not.toContain("Provisioning");
      expect(source.handlers.decide.get("Increase")).toContain("command: Increase");
      expect(source.handlers.evolve.get("Increased")).toContain("state.total");
      expect(markdown).toContain("B --> D");
      expect(markdown).not.toContain("B -->|from| D");
      expect(markdown).toContain("B -->|from| V0");
      expect(markdown).toContain("V0 -->|to| S0");
      expect(markdown).toContain('D{"decide"}');
      expect(markdown).toContain('V0[["evolve<br/>Increased"]]');
      expect(markdown).toContain(
        `\`\`\`\n\n### decide — Increase\n\n\`\`\`typescript\n${source.handlers.decide.get("Increase")}\n\`\`\``,
      );
      expect(markdown).toContain(
        `### evolve — Increased\n\n\`\`\`typescript\n${source.handlers.evolve.get("Increased")}\n\`\`\``,
      );
    }).pipe(Effect.runPromise));

  it("resolves imported spreads, overrides, shorthand functions, and property references", () =>
    Effect.gen(function* () {
      const source = yield* readHandlerSource(fixture, "Composed");
      expect([...source.decide.keys()]).toEqual(["First", "Overridden", "apply"]);
      expect(source.decide.get("First")).toContain("state + 10");
      expect(source.decide.get("Overridden")).toContain("state * 2");
      expect(source.decide.get("apply")).toContain("function apply");
      expect(source.evolve.get("Applied")).toContain("return state + amount");
    }).pipe(Effect.runPromise));

  it("reports unsupported source as a typed extraction failure", () =>
    Effect.gen(function* () {
      const error = yield* readHandlerSource(fixture, "Dynamic").pipe(Effect.flip);
      expect(error._tag).toBe("DiagramError");
      expect(error.message).toContain("Cannot extract Dynamic");
      expect(error.cause).toEqual(
        expect.objectContaining({ message: 'Unsupported handler key: ["Apply"]' }),
      );
    }).pipe(Effect.runPromise));

  it("does not fabricate tags for a partially tagged state schema", () => {
    const state = Schema.Union([Schema.TaggedStruct("Known", {}), Schema.String]);
    expect(stateTags(state.ast)).toEqual([]);
  });

  it("describes untagged state fields and constraints in both state boxes", () => {
    const aggregate = Schema.decodeUnknownSync(AggregateContract)(Counter);
    const markdown = renderCommand(
      {
        ...aggregate,
        definition: { ...aggregate.definition, state: Schema.Struct({ notes: Schema.Int }) },
      },
      "Increase",
      formattingSource({
        decide: new Map([["Increase", "() => []"]]),
        evolve: new Map([["Increased", "(state) => state"]]),
      }),
    );
    expect(markdown).toContain("input state<br/>Schema.Struct({ #quot;notes#quot;: Schema.Int })");
    expect(markdown).toContain("output state<br/>Schema.Struct({ #quot;notes#quot;: Schema.Int })");
    expect(markdown).not.toContain("Objects");
  });

  it("fails instead of inventing missing handler source", () => {
    const aggregate = Schema.decodeUnknownSync(AggregateContract)(Counter);
    expect(() =>
      renderCommand(
        aggregate,
        "Increase",
        formattingSource({ decide: new Map(), evolve: new Map() }),
      ),
    ).toThrow("Missing decide source: Increase");
    expect(() =>
      renderCommand(
        aggregate,
        "Increase",
        formattingSource({
          decide: new Map([["Increase", '() => "<br/> #quot;"']]),
          evolve: new Map(),
        }),
      ),
    ).toThrow("Missing evolve source: Increased");
  });

  it("escapes diagram labels but preserves source and embedded Markdown fences in code blocks", () => {
    const aggregate = Schema.decodeUnknownSync(AggregateContract)(Counter);
    const decision = '() => "<br/> #quot;" /*\n```\n*/';
    const source = {
      decide: new Map([["Increase", decision]]),
      evolve: new Map([["Increased", "(state) => state"]]),
    };
    const markdown = renderCommand(
      {
        ...aggregate,
        definition: { ...aggregate.definition, state: Schema.Struct({ "<notes>": Schema.Int }) },
      },
      "Increase",
      formattingSource(source),
    );
    expect(markdown).toContain(
      "input state<br/>Schema.Struct({ #quot;#60;notes#62;#quot;: Schema.Int })",
    );
    expect(markdown).toContain(
      "output state<br/>Schema.Struct({ #quot;#60;notes#62;#quot;: Schema.Int })",
    );
    expect(markdown).toContain(`\`\`\`\`typescript\n${decision}\n\`\`\`\``);
    expect(markdown).toContain("```typescript\n(state) => state\n```");
  });
});
