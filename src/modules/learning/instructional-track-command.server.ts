import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  domainEvents,
  instructionalTrackCommandReceipts,
  type JsonObject,
} from "@/db/canonical-v301";
import { DomainError } from "@/domain/errors";
import type { CommandContext } from "@/domain/command-context";

type TrackTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

function stableJson(value: unknown): string {
  const encoded = JSON.stringify(value, (_key, item: unknown) => {
    if (item instanceof Date) return item.toISOString();
    if (item && typeof item === "object" && !Array.isArray(item)) {
      return Object.fromEntries(
        Object.entries(item).sort(([left], [right]) =>
          left < right ? -1 : left > right ? 1 : 0,
        ),
      );
    }
    return item;
  });
  if (encoded === undefined) throw new DomainError("VALIDATION_FAILED", "Command input is not serializable.");
  return encoded;
}

export function instructionalCommandFingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export async function runInstructionalTrackCommand(
  tx: TrackTransaction,
  context: CommandContext,
  input: {
    requestId: string;
    action: string;
    eventType: string;
    entityKind: string;
    entityId: string;
    owningOrganizationId: string;
    payload: unknown;
  },
  apply: () => Promise<JsonObject>,
): Promise<JsonObject> {
  if (!context.actorPersonId) {
    throw new DomainError("AUTHENTICATION_REQUIRED");
  }
  const requestLock = `${context.actorPersonId}:${input.requestId}`;
  await tx.execute(sql`
    SELECT pg_advisory_xact_lock(hashtextextended(${`instructional-track:${requestLock}`}, 0))
  `);

  const fingerprint = instructionalCommandFingerprint({
    action: input.action,
    owningOrganizationId: input.owningOrganizationId,
    payload: input.payload,
  });
  const [prior] = await tx
    .select()
    .from(instructionalTrackCommandReceipts)
    .where(
      and(
        eq(instructionalTrackCommandReceipts.actorPersonId, context.actorPersonId),
        eq(instructionalTrackCommandReceipts.requestId, input.requestId),
      ),
    )
    .limit(1);
  if (prior) {
    if (prior.fingerprint !== fingerprint) {
      throw new DomainError("CONFLICT", "This request ID was already used for different input.");
    }
    return prior.result;
  }

  const result = await apply();
  const evidence: JsonObject = {
    requestId: input.requestId,
    inputHash: fingerprint,
    owningOrganizationId: input.owningOrganizationId,
    result,
  };
  await tx.insert(instructionalTrackCommandReceipts).values({
    actorPersonId: context.actorPersonId,
    requestId: input.requestId,
    fingerprint,
    result,
  });
  await tx.insert(auditEvents).values({
    actorPersonId: context.actorPersonId,
    owningOrganizationId: input.owningOrganizationId,
    eventCode: input.action,
    entityKind: input.entityKind,
    entityId: input.entityId,
    payload: evidence,
  });
  await tx.insert(domainEvents).values({
    eventType: input.eventType,
    aggregateType: input.entityKind,
    aggregateId: input.entityId,
    actorPersonId: context.actorPersonId,
    payload: evidence,
  });
  return result;
}
