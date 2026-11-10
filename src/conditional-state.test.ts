import { Effect, Schema } from "effect";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vite-plus/test";
import { AggregateContract } from "./diagram";
import { Conditional, Overridden, Partial } from "./conditional-state.fixture";
import { readStateDiagram, renderStateDiagram } from "./state-diagram";

const path = fileURLToPath(new URL("conditional-state.fixture.ts", import.meta.url));

describe("conditional state tags", () => {
  it("collects distinct literal destinations and applies subsequent events to each", () =>
    Effect.gen(function* () {
      const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(Conditional);
      const diagram = yield* readStateDiagram({ path, exportName: "Conditional", aggregate });
      expect(diagram.transitions).toEqual([
        { from: "Idle", event: "Routed", to: "Waiting", command: "Route" },
        { from: "Idle", event: "Routed", to: "Running", command: "Route" },
        { from: "Waiting", event: "Noted", to: "Waiting", command: "Route" },
        { from: "Running", event: "Noted", to: "Running", command: "Route" },
      ]);
      expect(diagram.unresolved).toEqual([]);
      const markdown = renderStateDiagram(diagram);
      expect(markdown).toContain("s0 --> s1: 1. Routed");
      expect(markdown).toContain("s0 --> s2: 1. Routed");
      expect(markdown).toContain("| Idle | Route | 1. Routed | Waiting |");
      expect(markdown).toContain("| Idle | Route | 1. Routed | Running |");
      expect(markdown).toContain("| Waiting | Route | 2. Noted | Waiting |");
    }).pipe(Effect.runPromise));

  it("retains known branches while reporting unknown destinations", () =>
    Effect.gen(function* () {
      const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(Partial);
      const diagram = yield* readStateDiagram({ path, exportName: "Partial", aggregate });
      expect(diagram.transitions).toEqual([
        { from: "Idle", event: "Routed", to: "Waiting", command: "Route" },
        { from: "Waiting", event: "Noted", to: "Waiting", command: "Route" },
      ]);
      expect(diagram.unresolved).toEqual([
        expect.stringContaining("Routed: unresolved destination:"),
      ]);
    }).pipe(Effect.runPromise));

  it("respects a later explicit tag overriding a conditional spread", () =>
    Effect.gen(function* () {
      const aggregate = yield* Schema.decodeUnknownEffect(AggregateContract)(Overridden);
      const diagram = yield* readStateDiagram({ path, exportName: "Overridden", aggregate });
      expect(diagram.transitions).toEqual([
        { from: "Idle", event: "Routed", to: "Idle", command: "Route" },
        { from: "Idle", event: "Noted", to: "Idle", command: "Route" },
      ]);
      expect(diagram.unresolved).toEqual([]);
    }).pipe(Effect.runPromise));
});
