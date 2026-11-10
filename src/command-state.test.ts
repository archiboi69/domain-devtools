import { Effect, Schema } from "effect";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { AggregateContract, renderCommand } from "./diagram";
import { Lifecycle, Sequence } from "./state-diagram.fixture";
import { Partial } from "./conditional-state.fixture";
import { readCommandDiagramSource } from "./state-diagram";

const path = fileURLToPath(new URL("state-diagram.fixture.ts", import.meta.url));

describe("command state candidates", () => {
  it("keeps intermediate states out of command inputs and narrows each event output separately", () =>
    Effect.gen(function* () {
      const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(Sequence);
      const source = yield* readCommandDiagramSource({ path, exportName: "Sequence", aggregate });
      expect(source.states.get("Run")?.inputs).toEqual(["Idle"]);
      const markdown = renderCommand(aggregate, "Run", source);
      expect(markdown).toContain('B["input state<br/>Idle"]');
      expect(markdown).toContain('S0["output state<br/>Active"]');
      expect(markdown).toContain('S1["output state<br/>Done"]');
      expect(markdown).not.toContain("Unknown — partial analysis");
    }).pipe(Effect.runPromise));

  it("does not attach another command's gaps to a resolved command", () =>
    Effect.gen(function* () {
      const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(Lifecycle);
      const source = yield* readCommandDiagramSource({ path, exportName: "Lifecycle", aggregate });
      expect(source.states.get("SelectNested")?.unresolved.length).toBeGreaterThan(0);
      expect(source.states.get("Finish")?.unresolved).toEqual([]);
      const markdown = renderCommand(aggregate, "Finish", source);
      expect(markdown).toContain('B["input state<br/>Active"]');
      expect(markdown).not.toContain("Unknown — partial analysis");
      expect(markdown).not.toContain("### Analysis gaps");
    }).pipe(Effect.runPromise));

  it("retains known destinations and marks incomplete candidates instead of substituting all states", () =>
    Effect.gen(function* () {
      const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(Partial);
      const source = yield* readCommandDiagramSource({
        path: fileURLToPath(new URL("conditional-state.fixture.ts", import.meta.url)),
        exportName: "Partial",
        aggregate,
        commandTag: "Route",
      });
      const markdown = renderCommand(aggregate, "Route", source);
      expect(markdown).toContain('S0["output state<br/>Waiting"]');
      expect(markdown).not.toContain("Unknown — partial analysis");
      expect(markdown).not.toContain("Static candidates");
      expect(markdown).toContain("### Analysis gaps");
      expect(markdown).toContain("Routed: unresolved destination:");
      expect(markdown).not.toContain("<br/>Running");
    }).pipe(Effect.runPromise));
});
