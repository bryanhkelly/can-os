import { expectTypeOf, test } from "vitest";
import { z } from "zod";
import { authenticatedQuery, authenticatedCommand, scopedQuery, institutionalDecision } from "./server-functions";

// These factories are built with real TanStack Start types, not mocked factories.
// The compiler must accept the validator's inferred input and the serializable
// result through all four framework handlers.
const input = z.object({ siteId: z.string(), limit: z.number().int() });

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

test("real TanStack Start factory return types remain callable", () => {
  expectTypeOf(query).toBeFunction();
  expectTypeOf(command).toBeFunction();
  expectTypeOf(scoped).toBeFunction();
  expectTypeOf(decision).toBeFunction();
});
