import { Array, Schema } from "effect";
import * as Lens from "effect/Optic";
import { replace as set } from "effect/Optic";

const State = Schema.Union([
  Schema.TaggedStruct("Before", { count: Schema.Finite }),
  Schema.TaggedStruct("Live", { count: Schema.Finite }),
  Schema.TaggedStruct("Done", { count: Schema.Finite }),
]);
type State = typeof State.Type;
const CountSet = Schema.TaggedStruct("CountSet", {});
const CurriedSet = Schema.TaggedStruct("CurriedSet", {});
const Changed = Schema.TaggedStruct("Changed", {});
const Whole = Schema.TaggedStruct("Whole", {});
const Replaced = Schema.TaggedStruct("Replaced", {});
const TagTouched = Schema.TaggedStruct("TagTouched", {});
const Fake = Schema.TaggedStruct("Fake", {});
const live = Lens.id<State>().tag("Live");
const count = live.key("count");
const fake = { replace: (s: State): State => s };

export class Optics {
  static readonly aggregateName = "Optics";
  static readonly definition = {
    state: State,
    initial: { _tag: "Before", count: 0 },
    commands: Array.map(
      ["CountSet", "CurriedSet", "Changed", "Whole", "Replaced", "TagTouched", "Fake"],
      (tag) => ({ tag, fields: {}, events: [{ tag }], rejects: [] }),
    ),
    decide: {
      CountSet: (_s: State) => [CountSet.make({})],
      CurriedSet: (s: State) => (s._tag === "Live" ? [CurriedSet.make({})] : []),
      Changed: (s: State) => (s._tag === "Live" ? [Changed.make({})] : []),
      Whole: (s: State) => (s._tag === "Live" ? [Whole.make({})] : []),
      Replaced: (s: State) => (s._tag === "Live" ? [Replaced.make({})] : []),
      TagTouched: (s: State) => (s._tag === "Live" ? [TagTouched.make({})] : []),
      Fake: (s: State) => (s._tag === "Live" ? [Fake.make({})] : []),
    },
    evolve: {
      CountSet: (s: State) => set(s, count, 1),
      CurriedSet: (s: State) => Lens.replace(count, 2)(s),
      Changed: (s: State) => live.modify((value) => ({ ...value, count: value.count + 1 }))(s),
      Whole: (s: State) =>
        Lens.modify(s, Lens.id<State>(), (): State => ({ _tag: "Done", count: 0 })),
      Replaced: (s: State) => Lens.replace(s, Lens.id<State>(), { _tag: "Done", count: 0 }),
      TagTouched: (s: State) =>
        Lens.replace(
          s,
          Lens.id<{ readonly _tag: State["_tag"]; readonly count: number }>().key("_tag"),
          "Done",
        ),
      Fake: (s: State) => fake.replace(s),
    },
  };
}
