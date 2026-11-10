import { Schema } from "effect";

const State = Schema.Union([
  Schema.TaggedStruct("Idle", {}),
  Schema.TaggedStruct("Waiting", {}),
  Schema.TaggedStruct("Running", {}),
]);
type State = typeof State.Type;
const Routed = Schema.TaggedStruct("Routed", {
  review: Schema.Boolean,
  fast: Schema.Boolean,
  destination: Schema.Literals(["Waiting", "Running"]),
});
const Noted = Schema.TaggedStruct("Noted", {});

export class Conditional {
  static readonly aggregateName = "Conditional";
  static readonly definition = {
    state: State,
    initial: { _tag: "Idle" },
    commands: [
      { tag: "Route", fields: {}, events: [{ tag: "Routed" }, { tag: "Noted" }], rejects: [] },
    ],
    decide: {
      Route: (state: State, command: typeof Routed.Type) =>
        state._tag === "Idle" ? [Routed.make(command), Noted.make({})] : [],
    },
    evolve: {
      Routed: (_s: State, event: typeof Routed.Type): State => ({
        _tag: event.review
          ? ("Waiting" as const)
          : event.fast
            ? ("Running" as const)
            : ("Running" as const),
      }),
      Noted: (s: State): State => ({ ...s }),
    },
  };
}

export class Partial {
  static readonly aggregateName = "Partial";
  static readonly definition = {
    ...Conditional.definition,
    decide: Conditional.definition.decide,
    evolve: {
      Routed: (_s: State, event: typeof Routed.Type): State => ({
        _tag: event.review ? ("Waiting" as const) : event.destination,
      }),
      Noted: Conditional.definition.evolve.Noted,
    },
  };
}

export class Overridden {
  static readonly aggregateName = "Overridden";
  static readonly definition = {
    ...Conditional.definition,
    decide: Conditional.definition.decide,
    evolve: {
      Routed: (_s: State, event: typeof Routed.Type): State => ({
        // oxlint-disable-next-line unicorn/no-useless-spread -- Exercises last-write-wins extraction across a conditional spread.
        ...{ _tag: event.review ? ("Waiting" as const) : ("Running" as const) },
        _tag: "Idle",
      }),
      Noted: Conditional.definition.evolve.Noted,
    },
  };
}
