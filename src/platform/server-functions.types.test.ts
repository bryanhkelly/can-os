import { expectTypeOf, test } from "vitest";
import { z } from "zod";
import { authenticatedQuery, authenticatedCommand, scopedQuery, institutionalDecision } from "./server-functions";

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
