import { expectTypeOf, test } from "vitest";
import { z } from "zod";
import { authenticatedQuery, authenticatedCommand, scopedQuery, institutionalDecision } from "./server-functions";

// This module intentionally imports the real TanStack Start factory.
// The runtime calls are not executed: compilation checks framework inference.
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

test("server factory input/output contracts compile against real TanStack types", () => {
  expectTypeOf<Parameters<typeof query>[0]>().toEqualTypeOf<{ data: { siteId: string; limit: number } }>();
  expectTypeOf<Parameters<typeof command>[0]>().toEqualTypeOf<{ data: { siteId: string; limit: number } }>();
  expectTypeOf<Parameters<typeof scoped>[0]>().toEqualTypeOf<{ data: { siteId: string; limit: number } }>();
  expectTypeOf<Parameters<typeof decision>[0]>().toEqualTypeOf<{ data: { siteId: string; limit: number } }>();
});
