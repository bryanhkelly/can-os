import { expectTypeOf, test, vi } from "vitest";
// Compile-only declarations: importing TanStack wrappers must not initialize Neon.
vi.mock("@/db/client", () => ({ db: {} }));
import { z } from "zod";
import { authenticatedQuery, authenticatedCommand, scopedQuery, institutionalDecision, type SerializableResult } from "./server-functions";

// Compile-time framework contract checks. Factories are intentionally not
// executed in the test process: they depend on TanStack's server runtime.
const input = z.object({ siteId: z.string(), limit: z.number().int() });

function compileTanStackContracts() {
  const query = authenticatedQuery(input, async (_context, data) => ({
    siteId: data.siteId,
    count: data.limit,
  }));
  const command = authenticatedCommand(input, async (_context, data) => ({
    accepted: data.limit > 0,
  }));
  const scoped = scopedQuery(input, "site.read", async () => undefined,
    async (_context, data) => ({ siteId: data.siteId }));
  const decision = institutionalDecision(input, "site.approve", async () => undefined,
    async () => ({ approved: true }));
  return { query, command, scoped, decision };
}

test("real TanStack Start factories preserve callable types", () => {
  expectTypeOf(compileTanStackContracts).toBeFunction();
  // TypeScript checks the factory bodies above, including their actual
  // validator and handler generics, without invoking server runtime APIs.
});

// Compile-time negative contract: transport results cannot contain functions,
// class instances or other values outside the wrapper's JSON subset.
function compileInvalidResultContract() {
  // @ts-expect-error Functions are not valid JSON transport results.
  return authenticatedCommand(input, async () => ({ invalid: () => 1 }));
}
void compileInvalidResultContract;

const validTransportValue = { siteId: "site-1", count: 2 } satisfies SerializableResult;
void validTransportValue;
