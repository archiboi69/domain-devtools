import { Counter as ImportedCounter } from "./diagram.fixture";
import { Lifecycle } from "./state-diagram.fixture";
import { Partial } from "./conditional-state.fixture";

const Primary = {
  kind: "Model" as const,
  modelName: "Primary",
  aggregates: [ImportedCounter, Lifecycle, Partial] as const,
};
const Secondary = {
  kind: "Model" as const,
  modelName: "Secondary",
  aggregates: [ImportedCounter] as const,
};

export { Primary as Main, Primary as Alias, Secondary };
