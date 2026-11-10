import { Counter } from "./diagram.fixture";

// oxlint-disable-next-line typescript/no-extraneous-class -- A different owner with identical domain names must not be deduplicated.
class OtherCounter {
  static readonly aggregateName = "Counter";
  static readonly definition = Counter.definition;
}

export const Other = {
  kind: "Model" as const,
  modelName: "Other",
  aggregates: [OtherCounter] as const,
};
