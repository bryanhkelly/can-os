import { describe, expect, it } from "vitest";
import { and, eq, isNull, lte, notInArray, or } from "drizzle-orm";
import { PgDialect, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { outboundClaimPredicate, outboundLeaseOwnership } from "@/modules/communication/outbound-lease-predicates.server";

const delivery = pgTable("delivery", {
  id: text("id").notNull(),
  status: text("status").notNull(),
  nextAttemptAt: timestamp("next_attempt_at", { mode: "date" }),
  leaseUntil: timestamp("lease_until", { mode: "date" }),
});
const dialect = new PgDialect();
const now = new Date("2026-11-25T00:00:00Z");

describe("shared outbound receipt predicates", () => {
  it.each([{ seen: [] as string[] }, { seen: ["already-seen"] }])(
    "preserves the original eligibility SQL for $seen", ({ seen }) => {
    const expected = and(
      ...(seen.length ? [notInArray(delivery.id, seen)] : []),
      or(
        and(eq(delivery.status, "pending"),
          or(isNull(delivery.nextAttemptAt), lte(delivery.nextAttemptAt, now))),
        and(eq(delivery.status, "failed"), lte(delivery.nextAttemptAt, now)),
        and(eq(delivery.status, "processing"), lte(delivery.leaseUntil, now)),
      ),
    );
    expect(dialect.sqlToQuery(outboundClaimPredicate(delivery, now, seen)!))
      .toEqual(dialect.sqlToQuery(expected!));
  });

  it("fences updates by receipt, processing state and exact lease", () => {
    const claim = { id: "receipt", attempts: 1, leaseUntil: now };
    const expected = and(
      eq(delivery.id, claim.id),
      eq(delivery.status, "processing"),
      eq(delivery.leaseUntil, claim.leaseUntil),
    );
    expect(dialect.sqlToQuery(outboundLeaseOwnership(delivery, claim)!))
      .toEqual(dialect.sqlToQuery(expected!));
  });
});
