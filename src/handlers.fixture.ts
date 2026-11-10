function apply(state: number, amount: number) {
  return state + amount;
}

export const sharedDecisions = {
  First: (state: number) => state + 1,
  Overridden: (state: number) => state - 1,
  apply,
};

export const sharedEvolution = {
  Applied: apply,
};
