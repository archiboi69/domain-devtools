import { Effect, Schema } from "effect";

const State = Schema.Union([
  Schema.TaggedStruct("Waiting", {}),
  Schema.TaggedStruct("Ready", {}),
  Schema.TaggedStruct("Done", {}),
]);
type State = typeof State.Type;
class Denied extends Schema.TaggedError<Denied, { readonly brand: unique symbol }>()(
  "Denied",
  {},
) {}
const Finished = Schema.TaggedStruct("Finished", {});

function select(allowed: boolean, value: State): Extract<State, { _tag: "Ready" }> | Denied {
  if (value._tag !== "Ready") return Denied.make({});
  return allowed ? value : Denied.make({});
}
const authorize = Effect.fn(function* (allowed: boolean, input: State) {
  const candidate = select(allowed, input);
  if (candidate._tag !== "Ready") return yield* candidate;
  return candidate;
});
// oxlint-disable-next-line oxc/only-used-in-recursion -- Verifies that recursive source analysis stops without executing the helper.
function recursive(value: State): State {
  return recursive(value);
}

export class HelperFlow {
  static readonly aggregateName = "HelperFlow";
  static readonly definition = {
    state: State,
    initial: { _tag: "Waiting" },
    commands: [
      { tag: "Finish", fields: {}, events: [{ tag: "Finished" }], rejects: [{ tag: "Denied" }] },
      { tag: "Plain", fields: {}, events: [{ tag: "Finished" }], rejects: [{ tag: "Denied" }] },
      { tag: "Recursive", fields: {}, events: [{ tag: "Finished" }], rejects: [] },
    ],
    decide: {
      Finish: Effect.fn(function* (root: State, command: { allowed: boolean }) {
        yield* authorize(command.allowed, root);
        const current = yield* authorize(command.allowed, root);
        if (current._tag !== "Ready") return [];
        return [Finished.make({})];
      }),
      Plain: (root: State, command: { allowed: boolean }) => {
        const current = select(command.allowed, root);
        if (current._tag !== "Ready") return current;
        return [Finished.make({})];
      },
      Recursive: (root: State) => {
        const current = recursive(root);
        return current._tag === "Ready" ? [Finished.make({})] : [];
      },
    },
    evolve: { Finished: (): State => ({ _tag: "Done" }) },
  };
}
