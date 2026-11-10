import { Schema } from "effect";
import { sharedDecisions as importedDecisions, sharedEvolution } from "./handlers.fixture";

class Increased extends Schema.TaggedClass<Increased, { readonly brand: unique symbol }>()(
  "Increased",
  { amount: Schema.Finite },
) {
  static readonly tag = "Increased";
}
class Limited extends Schema.TaggedClass<Limited, { readonly brand: unique symbol }>()(
  "Limited",
  {},
) {
  static readonly tag = "Limited";
}
class Increase extends Schema.TaggedClass<Increase, { readonly brand: unique symbol }>()(
  "Increase",
  { amount: Schema.Finite },
) {
  static readonly tag = "Increase";
  static readonly events = [Increased];
  static readonly rejects = [Limited];
}
const State = Schema.Union([
  Schema.TaggedStruct("Empty", {}),
  Schema.TaggedStruct("Counting", { total: Schema.Finite }),
]);

// oxlint-disable-next-line typescript/no-extraneous-class -- Mirrors Domain.Aggregate's static class contract without importing a host model.
export class Counter {
  static readonly aggregateName = "Counter";
  static readonly definition = {
    state: State,
    commands: [Increase],
    decide: {
      Increase: (_state: typeof State.Type, command: Increase) => [
        Increased.make({ amount: command.amount }),
      ],
    },
    evolve: {
      Increased: (state: typeof State.Type, event: Increased) => ({
        _tag: "Counting" as const,
        total: (state._tag === "Counting" ? state.total : 0) + event.amount,
      }),
    },
  };
}

// The extractor must reject dynamic keys rather than guess their values.
export class Dynamic {
  static readonly definition = {
    decide: { ["Apply"]: (state: number) => state },
    evolve: {},
  };
}

const later = { Overridden: (state: number) => state * 2 };
const decisions = {
  ...importedDecisions,
  ...later,
  First: (state: number) => state + 10,
} as const;

// oxlint-disable-next-line typescript/no-extraneous-class -- Exercises source extraction for composed static definitions.
export class Composed {
  static readonly definition = {
    decide: decisions,
    evolve: { Applied: sharedEvolution.Applied },
  };
}
