import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import type { AccessContext } from "@/domain/access-context";
import { getCommandContext, withAuth } from "@/modules/identity/command-context.server";

/** JSON-compatible result contract for server/client transport. */
export type SerializableResult =
  | string | number | boolean | null
  | readonly SerializableResult[]
  | { readonly [key: string]: SerializableResult };

/**
 * Server-only factories. The authenticated identity always comes from the
 * verified request session, never from submitted input.
 *
 * TanStack Start validates generic handlers with a conditional serializability\n * type that cannot prove an unresolved TResult is serializable. We disable\n * that framework-only check for these generic factories; the JSON result\n * constraint and Zod validator remain explicit. Do not return classes,\n * Dates, Maps, or other non-JSON transport values from these wrappers.\n *\n * Authorization beyond authentication is deliberately explicit: capability
 * and resource guards must remain in the domain service or handler.
 */
function privateResponse() {
  setResponseHeader("Cache-Control", "private, no-store");
}

export function authenticatedQuery<TSchema extends z.ZodTypeAny, TResult extends SerializableResult>(
  schema: TSchema,
  handler: (context: AccessContext, input: z.output<TSchema>) => Promise<TResult>,
) {
  return createServerFn({ method: "GET", strict: false })
    .validator((value: unknown): z.output<TSchema> => schema.parse(value))
    .handler(async ({ data }) => {
      privateResponse();
      const context = await getCommandContext(getRequest());
      return handler(context, data);
    });
}

export function authenticatedCommand<TSchema extends z.ZodTypeAny, TResult extends SerializableResult>(
  schema: TSchema,
  handler: (context: AccessContext, input: z.output<TSchema>) => Promise<TResult>,
) {
  return createServerFn({ method: "POST", strict: false })
    .validator((value: unknown): z.output<TSchema> => schema.parse(value))
    .handler(async ({ data }) => {
      privateResponse();
      const context = await getCommandContext(getRequest());
      return handler(context, data);
    });
}

/** Capability is verified before resource guard and domain execution. */
export function scopedQuery<TSchema extends z.ZodTypeAny, TResult extends SerializableResult>(
  schema: TSchema,
  capability: string,
  resourceGuard: (context: AccessContext, input: z.output<TSchema>) => Promise<void>,
  handler: (context: AccessContext, input: z.output<TSchema>) => Promise<TResult>,
) {
  return createServerFn({ method: "GET", strict: false })
    .validator((value: unknown): z.output<TSchema> => schema.parse(value))
    .handler(async ({ data }) => {
      privateResponse();
      return withAuth(getRequest(), capability, async context => {
        await resourceGuard(context, data);
        return handler(context, data);
      });
    });
}

/** Deliberately does not bypass institutional decision services or audit. */
export function institutionalDecision<TSchema extends z.ZodTypeAny, TResult extends SerializableResult>(
  schema: TSchema,
  capability: string,
  resourceGuard: (context: AccessContext, input: z.output<TSchema>) => Promise<void>,
  decide: (context: AccessContext, input: z.output<TSchema>) => Promise<TResult>,
) {
  return createServerFn({ method: "POST", strict: false })
    .validator((value: unknown): z.output<TSchema> => schema.parse(value))
    .handler(async ({ data }) => {
      privateResponse();
      return withAuth(getRequest(), capability, async context => {
        await resourceGuard(context, data);
        return decide(context, data);
      });
    });
}
