import { assertCapability, type CommandContext } from "@/domain/command-context";

/**
 * A server-only orchestration boundary. Adapters own the authoritative
 * transaction/idempotency store and audit schema. Never trust a client actor.
 *
 * Authentication and validation precede writes. Resource authorization,
 * idempotency reservation, business writes, and audit share the transaction.
 */
export type CommandAudit<Result, Parsed, Tx> =
  | {
      audit: (tx: Tx, event: {
        actor: CommandContext;
        input: Parsed;
        result: Result;
      }) => Promise<void>;
      auditOwnedByExecute?: never;
    }
  | {
      /** Explicit acknowledgement: execute writes the authoritative audit in tx. */
      auditOwnedByExecute: true;
      audit?: never;
    };

export type CommandAdapters<Input, Parsed, Result, Tx> = {
  authenticate: () => Promise<CommandContext>;
  capability: string;
  validate: (input: Input) => Parsed;
  authorize?: (tx: Tx, actor: CommandContext, input: Parsed) => Promise<void>;
  transaction: <T>(work: (tx: Tx) => Promise<T>) => Promise<T>;
  execute: (tx: Tx, actor: CommandContext, input: Parsed) => Promise<Result>;
  /** Feature adapter must atomically claim or load the command inside tx. */
  idempotency?: {
    key: (actor: CommandContext, input: Parsed) => string;
    run: (tx: Tx, key: string, work: () => Promise<Result>) => Promise<Result>;
  };
} & CommandAudit<Result, Parsed, Tx>;

export async function executeCommand<Input, Parsed, Result, Tx>(
  input: Input,
  adapters: CommandAdapters<Input, Parsed, Result, Tx>,
): Promise<Result> {
  const actor = await adapters.authenticate();
  assertCapability(actor, adapters.capability);
  const parsed = adapters.validate(input);
  return adapters.transaction(async tx => {
    await adapters.authorize?.(tx, actor, parsed);
    const perform = async () => {
      const result = await adapters.execute(tx, actor, parsed);
      await adapters.audit?.(tx, { actor, input: parsed, result });
      return result;
    };
    const idem = adapters.idempotency;
    return idem ? idem.run(tx, idem.key(actor, parsed), perform) : perform();
  });
}
