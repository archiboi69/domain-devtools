import { Array, Effect, Schema } from "effect";
import * as Fx from "effect/Effect";
import { fn as trace } from "effect/Effect";

const State = Schema.Union([Schema.TaggedStruct("Idle", {}), Schema.TaggedStruct("Active", {})]);
type State = typeof State.Type;
const Activated = Schema.TaggedStruct("Activated", {});
const traced = Fx.fn;
function* activate(input: State) {
  yield* Fx.void;
  if (input._tag !== "Idle") return [];
  return [Activated.make({})];
}

export class Wrapped {
  static readonly aggregateName = "Wrapped";
  static readonly definition = {
    state: State,
    initial: { _tag: "Idle" },
    commands: Array.map(
      ["Plain", "Named", "Aliased", "Local", "Untraced", "Regular", "Generator", "Transformed"],
      (tag) => ({
        tag,
        fields: {},
        events: [{ tag: "Activated" }],
        rejects: [],
      }),
    ),
    decide: {
      Plain: Fx.fn(function* (s: State) {
        yield* Fx.void;
        return s._tag === "Idle" ? [Activated.make({})] : [];
      }),
      Named: Effect.fn("activate")(function* (current: State) {
        yield* Effect.void;
        if (current._tag !== "Idle") return [];
        return [Activated.make({})];
      }),
      Aliased: trace(activate),
      Local: traced(activate),
      Untraced: Fx.fnUntraced(activate),
      Regular: Fx.fn("regular")((s: State) =>
        Fx.succeed(s._tag === "Idle" ? [Activated.make({})] : []),
      ),
      Generator: Fx.fn("generator")((s: State) =>
        Fx.gen(function* () {
          yield* Fx.void;
          if (s._tag !== "Idle") return [];
          return yield* Fx.succeed([Activated.make({})]);
        }),
      ),
      Transformed: Fx.fn(
        activate,
        Effect.map(() => []),
      ),
    },
    evolve: {
      Activated: (): State => ({ _tag: "Active" }),
    },
  };
}

const FakeEffect = { fn: <A>(value: A): A => value };
export class Imposter {
  static readonly definition = {
    decide: { Activate: FakeEffect.fn((s: State) => s) },
    evolve: {},
  };
}
