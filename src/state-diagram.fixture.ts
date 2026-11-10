import { Effect, Schema } from "effect";

const Activated = Schema.TaggedStruct("Activated", {});
const Resumed = Schema.TaggedStruct("Resumed", {});
const Completed = Schema.TaggedStruct("Completed", {});
const Noted = Schema.TaggedStruct("Noted", {});
const Reset = Schema.TaggedStruct("Reset", {});
const State = Schema.Union([
  Schema.TaggedStruct("Idle", {}),
  Schema.TaggedStruct("Active", {
    request: Schema.TaggedStruct("Base", {}),
    blocker: Schema.Union([Schema.TaggedStruct("Blocked", {}), Schema.TaggedStruct("Clear", {})]),
  }),
  Schema.TaggedStruct("Done", {}),
]);
type State = typeof State.Type;

export class Lifecycle {
  static readonly aggregateName = "Lifecycle";
  static readonly definition = {
    state: State,
    initial: { _tag: "Idle" },
    commands: [
      { tag: "Start", fields: {}, events: [{ tag: "Activated" }, { tag: "Resumed" }], rejects: [] },
      { tag: "Finish", fields: {}, events: [{ tag: "Completed" }, { tag: "Noted" }], rejects: [] },
      { tag: "ResetBlocked", fields: {}, events: [{ tag: "Reset" }], rejects: [] },
      { tag: "ResetOtherKind", fields: {}, events: [{ tag: "Reset" }], rejects: [] },
      { tag: "SelectNested", fields: {}, events: [{ tag: "Reset" }], rejects: [] },
    ],
    decide: {
      Start: (state: State, command: { resume: boolean }) =>
        Effect.gen(function* () {
          yield* Effect.void;
          if (state._tag !== "Idle") return [];
          if (command.resume) return [Resumed.make({})];
          return [Activated.make({})];
        }),
      Finish: (root: State) => {
        const state = root;
        switch (state._tag) {
          case "Idle":
          case "Done":
            return [];
          case "Active":
            break;
        }
        return [Completed.make({}), Noted.make({})];
      },
      ResetBlocked: (state: State) => {
        if (state._tag !== "Active" || state.blocker._tag !== "Blocked") return [];
        return [Reset.make({})];
      },
      ResetOtherKind: (state: State) => {
        if (state._tag !== "Active" || state.request._tag === "Base") return [];
        return [Reset.make({})];
      },
      SelectNested: (root: State, command: { child: State }) => {
        let state = root;
        state = command.child;
        if (state._tag !== "Active") return [];
        return [Reset.make({})];
      },
    },
    evolve: {
      Activated: (_state: State): State => ({
        _tag: "Active",
        request: { _tag: "Base" },
        blocker: { _tag: "Clear" },
      }),
      Resumed: (_state: State): State => ({
        _tag: "Active",
        request: { _tag: "Base" },
        blocker: { _tag: "Clear" },
      }),
      Completed: (state: State): State => {
        if (state._tag !== "Active") throw new Error("Expected Active");
        return { _tag: "Done" };
      },
      Noted: (state: State): State => ({ ...state }),
      Reset: (_state: State): State => ({ _tag: "Idle" }),
    },
  };
}

export class Sequence {
  static readonly aggregateName = "Sequence";
  static readonly definition = {
    ...Lifecycle.definition,
    commands: [
      { tag: "Run", fields: {}, events: [{ tag: "Activated" }, { tag: "Completed" }], rejects: [] },
    ],
    decide: {
      Run: (state: State) =>
        state._tag === "Idle" ? [Activated.make({}), Completed.make({})] : [],
    },
    evolve: Lifecycle.definition.evolve,
  };
}

const tagKey = "_tag";
export class ComputedEvolution {
  static readonly aggregateName = "ComputedEvolution";
  static readonly definition = {
    state: State,
    initial: { _tag: "Idle" },
    commands: [{ tag: "Start", fields: {}, events: [{ tag: "Activated" }], rejects: [] }],
    decide: {
      Start: (state: State) => (state._tag === "Idle" ? [Activated.make({})] : []),
    },
    evolve: {
      Activated: (_state: State): State => ({ [tagKey]: "Done" }),
    },
  };
}

export class Untagged {
  static readonly aggregateName = "Untagged";
  static readonly definition = {
    state: Schema.NullOr(Schema.Struct({ status: Schema.String })),
    initial: null,
    commands: [],
    decide: {},
    evolve: {},
  };
}
