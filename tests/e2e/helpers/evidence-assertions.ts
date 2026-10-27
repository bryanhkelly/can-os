import { expect } from "@playwright/test";
import type { Sql } from "../fixture";

/** Wait for canonical asynchronous notification evidence on a disposable database. */
export async function expectNotification(
  sql: Sql,
  input: { recipientPersonId: string; type: string; resourceId: string },
): Promise<void> {
  await expect.poll(async () => {
    const rows = (await sql.query(
      `select id from notifications
       where recipient_person_id = $1 and type = $2 and resource_id = $3`,
      [input.recipientPersonId, input.type, input.resourceId],
    )) as Array<{ id: string }>;
    return rows.length;
  }, { timeout: 15_000 }).toBeGreaterThanOrEqual(1);
}

/** Require exactly one event of each requested type across the authorized actors. */
export async function expectDomainEventsOnceForActors(
  sql: Sql,
  input: { actorPersonIds: string[]; eventTypes: readonly string[] },
): Promise<void> {
  const rows = (await sql.query(
    "select event_type from domain_events where actor_person_id = any($1::uuid[])",
    [input.actorPersonIds],
  )) as Array<{ event_type: string }>;
  for (const eventType of input.eventTypes) {
    expect(rows.filter(row => row.event_type === eventType)).toHaveLength(1);
  }
}

/**
 * Require each logical action group, allowing canonical synonyms such as
 * assignment.submit and submission.submit without weakening unrelated checks.
 */
export async function expectAuditActionGroups(
  sql: Sql,
  input: {
    resourceType?: string;
    resourceIds: string[];
    groups: readonly (readonly string[])[];
  },
): Promise<void> {
  const rows = (input.resourceType
    ? await sql.query(
      `select action from audit_events
       where resource_type = $1 and resource_id = any($2::uuid[])`,
      [input.resourceType, input.resourceIds],
    )
    : await sql.query(
      "select action from audit_events where resource_id = any($1::uuid[])",
      [input.resourceIds],
    )) as Array<{ action: string }>;
  const actions = new Set(rows.map(row => row.action));
  for (const alternatives of input.groups) {
    expect(alternatives.some(action => actions.has(action))).toBe(true);
  }
}

/** Require the exact active enrollment-kind projection for one student. */
export async function expectActiveEnrollmentKinds(
  sql: Sql,
  input: { studentProfileId: string; kinds: readonly string[] },
): Promise<void> {
  const rows = (await sql.query(
    `select kind from enrollments
     where student_profile_id = $1 and status = 'active' order by kind`,
    [input.studentProfileId],
  )) as Array<{ kind: string }>;
  expect(rows.map(row => row.kind)).toEqual(input.kinds);
}
