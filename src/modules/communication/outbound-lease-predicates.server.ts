import { and, eq, isNull, lte, notInArray, or } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import type { OutboundClaim } from "./outbound-dispatcher.server";

type LeaseColumns = {
  id: AnyPgColumn;
  status: AnyPgColumn;
  nextAttemptAt: AnyPgColumn;
  leaseUntil: AnyPgColumn;
};

/** Shared scheduling policy. Source adapters still own their table,
 * source-specific eligibility, row locking and lease writes. */
export function outboundClaimPredicate(
  columns: LeaseColumns,
  now: Date,
  seenIds: readonly string[],
) {
  return and(
    ...(seenIds.length ? [notInArray(columns.id, [...seenIds])] : []),
    or(
      and(eq(columns.status, "pending"),
        or(isNull(columns.nextAttemptAt), lte(columns.nextAttemptAt, now))),
      and(eq(columns.status, "failed"), lte(columns.nextAttemptAt, now)),
      and(eq(columns.status, "processing"), lte(columns.leaseUntil, now)),
    ),
  );
}

/** A worker may mutate only its own currently processing receipt. */
export function outboundLeaseOwnership(
  columns: Pick<LeaseColumns, "id" | "status" | "leaseUntil">,
  claim: OutboundClaim,
) {
  return and(
    eq(columns.id, claim.id),
    eq(columns.status, "processing"),
    eq(columns.leaseUntil, claim.leaseUntil),
  );
}
