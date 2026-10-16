export class LifecycleError extends Error {
  constructor(
    public readonly state: string,
    public readonly action: string,
  ) {
    super(`Invalid lifecycle transition: cannot "${action}" from state "${state}"`);
    this.name = "LifecycleError";
  }
}

export type Lifecycle<S extends string, A extends string> = {
  readonly states: readonly S[];
  can(state: S, action: A): boolean;
  apply(state: S, action: A): S;
};

/**
 * Declarative state machine for domain statuses. Pure and side-effect-free;
 * persistence layers stay responsible for authorization and event/audit writes.
 */
export function defineLifecycle<S extends string, A extends string>(config: {
  states: readonly S[];
  transitions: Record<A, { from: readonly S[]; to: S }>;
}): Lifecycle<S, A> {
  const states: readonly S[] = Object.freeze([...config.states]);
  const transitions = new Map<A, { from: readonly S[]; to: S }>(
    Object.entries(config.transitions).map(([action, transition]) => {
      const t = transition as { from: readonly S[]; to: S };
      return [action as A, { from: Object.freeze([...t.from]), to: t.to }];
    }),
  );

  function can(state: S, action: A): boolean {
    const transition = transitions.get(action);
    return !!transition && transition.from.includes(state);
  }

  function apply(state: S, action: A): S {
    const transition = transitions.get(action);
    if (!transition || !transition.from.includes(state)) {
      throw new LifecycleError(state, action);
    }
    return transition.to;
  }

  return { states, can, apply };
}
