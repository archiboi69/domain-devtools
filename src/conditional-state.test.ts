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
      expect(markdown).toContain("s0 --> s2: 2. Routed");
      expect(markdown).toContain("s1 --> s1: 3. Noted");
      expect(markdown).toContain("s2 --> s2: 4. Noted");
      expect(markdown).toContain("| 1 | Idle | Route | Routed | Waiting |");
      expect(markdown).toContain("| 2 | Idle | Route | Routed | Running |");
      expect(markdown).toContain("| 3 | Waiting | Route | Noted | Waiting |");
      expect(markdown).toContain("| 4 | Running | Route | Noted | Running |");
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
