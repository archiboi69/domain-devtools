import { Effect, Schema } from "effect";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { AggregateContract } from "./diagram";
import { ComputedEvolution, Lifecycle, Untagged } from "./state-diagram.fixture";
import { readStateDiagram, renderStateDiagram } from "./state-diagram";

const path = fileURLToPath(new URL("state-diagram.fixture.ts", import.meta.url));

describe("static state diagrams", () => {
  it("joins guarded decisions to ordered event evolution without inventing nested states", () =>
    Effect.gen(function* () {
      const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(Lifecycle);
      const diagram = yield* readStateDiagram({ path, exportName: "Lifecycle", aggregate });
      expect(diagram.states).toEqual(["Idle", "Active", "Done"]);
      expect(diagram.initial).toBe("Idle");
      expect(diagram.transitions).toEqual([
        { from: "Idle", event: "Resumed", to: "Active", command: "Start" },
        { from: "Idle", event: "Activated", to: "Active", command: "Start" },
        { from: "Active", event: "Completed", to: "Done", command: "Finish" },
        { from: "Done", event: "Noted", to: "Done", command: "Finish" },
        { from: "Active", event: "Reset", to: "Idle", command: "ResetBlocked" },
      ]);
      expect(diagram.unresolved).toEqual([
        "SelectNested: State alias reassigned: state = command.child",
      ]);
      const markdown = renderStateDiagram({ diagram, includeSelfLoops: false });
      expect(markdown).toContain("s0 --> s1: Resumed");
      expect(markdown).toContain("s0 --> s1: Activated");
      expect(markdown).not.toContain("s2 --> s2");
      expect(markdown).not.toContain('state "Blocked"');
      expect(markdown).toContain("| Done | Noted | Done | Finish |");
      expect(renderStateDiagram({ diagram, includeSelfLoops: true })).toContain("s2 --> s2: Noted");
    }).pipe(Effect.runPromise));

  it("leaves unsupported computed destinations unresolved instead of inventing an edge", () =>
    Effect.gen(function* () {
      const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(ComputedEvolution);
      const diagram = yield* readStateDiagram({ path, exportName: "ComputedEvolution", aggregate });
      expect(diagram.transitions).toEqual([]);
      expect(diagram.unresolved).toEqual([
        expect.stringContaining("Activated: unresolved destination:"),
      ]);
    }).pipe(Effect.runPromise));

  it("reports an untagged schema rather than promoting status values into states", () =>
    Effect.gen(function* () {
      const aggregate = yield* Schema.decodeEffect(AggregateContract)(Untagged);
      const diagram = yield* readStateDiagram({ path, exportName: "Untagged", aggregate });
      expect(diagram.states).toEqual([]);
      expect(diagram.transitions).toEqual([]);
      expect(renderStateDiagram({ diagram, includeSelfLoops: false })).not.toContain(
        "stateDiagram-v2",
      );
      expect(diagram.unresolved).toContain(
        "State schema has no complete top-level _tag union; no state nodes or status-based substates invented.",
      );
    }).pipe(Effect.runPromise));
});
