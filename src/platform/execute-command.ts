import { assertCapability, type CommandContext } from "@/domain/command-context";

/**
 * A server-only orchestration boundary. Adapters own the authoritative
 * transaction/idempotency store and audit schema. Never trust a client actor.
 *
 * Permission checks and validation run before any write. The idempotency
 * reservation, business command and audit append MUST share a transaction.
 */
export type CommandAdapters<Input, Parsed, Result, Tx> = {
  authenticate: () => Promise<CommandContext>;
  capability: string;
  validate: (input: Input) => Parsed;
  authorize?: (actor: CommandContext, input: Parsed) => Promise<void>;
  transaction: <T>(work: (tx: Tx) => Promise<T>) => Promise<T>;
  execute: (tx: Tx, actor: CommandContext, input: Parsed) => Promise<Result>;
  audit: (tx: Tx, event: {
    actor: CommandContext;
    input: Parsed;
    result: Result;
  }) => Promise<void>;
  /** Feature adapter must atomically claim or load the command inside tx. */
  idempotency?: {
    key: (actor: CommandContext, input: Parsed) => string;
    run: (tx: Tx, key: string, work: () => Promise<Result>) => Promise<Result>;
  };
};

export async function executeCommand<Input, Parsed, Result, Tx>(
  input: Input,
  adapters: CommandAdapters<Input, Parsed, Result, Tx>,
): Promise<Result> {
  const actor = await adapters.authenticate();
  assertCapability(actor, adapters.capability);
  const parsed = adapters.validate(input);
  await adapters.authorize?.(actor, parsed);
  return adapters.transaction(async tx => {
    const perform = async () => {
      const result = await adapters.execute(tx, actor, parsed);
      await adapters.audit(tx, { actor, input: parsed, result });
      return result;
    };
    const idem = adapters.idempotency;
    return idem ? idem.run(tx, idem.key(actor, parsed), perform) : perform();
  });
}
