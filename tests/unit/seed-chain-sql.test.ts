import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * Static regression guards for the executable seed chain
 * (functional-completeness-audit route-fixture follow-up):
 *
 * 1. student-s1-s4.sql must stay a sequence of standalone INSERT statements.
 *    A single data-modifying WITH chain breaks the BEFORE INSERT trigger on
 *    calendar_events (drizzle/0025): trigger-inserted scheduled_occurrences
 *    rows fail FK checks because sibling CTE inserts share one snapshot.
 * 2. identity-demo-accounts.sql must seed the Casey Counselor person itself so
 *    the declared base chain is standalone (gf41-support-referrals.sql inserts
 *    the same row idempotently but is not a base seed).
 * 3. valor-curriculum-marketplace.sql must not use the reserved word `grant`
 *    as a relation alias and must guard on the current @valorschool.demo
 *    synthetic identities while preserving its explicit seed authorization.
 */
const seed = (name: string) => readFileSync("scripts/seeds/" + name, "utf8");

describe("seed chain SQL", () => {
  it("student-s1-s4.sql inserts calendar_events in a standalone statement", () => {
    const sql = seed("student-s1-s4.sql");
    expect(sql).not.toMatch(/^WITH/im);
    expect(sql).toMatch(/;\s*INSERT INTO calendar_events\(/);
  });

  it("identity-demo-accounts.sql seeds the Casey Counselor person idempotently", () => {
    const sql = seed("identity-demo-accounts.sql");
    expect(sql).toContain(
      "('f4100000-0000-4000-8000-000000000003','Casey','Counselor','Casey'",
    );
    expect(sql).toMatch(/INSERT INTO people\([\s\S]*?ON CONFLICT \(id\) DO NOTHING;/);
  });

  it("new-experiences-v1.sql stays sequential and self-sufficient on the base fixture", () => {
    const sql = seed("new-experiences-v1.sql");
    // No data-modifying WITH chain: sibling CTE inserts are invisible to FK
    // checks (notifications_recipient_person_id_people_id_fk regression).
    expect(sql).not.toMatch(/^WITH/im);
    expect(sql).toMatch(/;\s*INSERT INTO notifications\(/);
    // The guardian persona rows (attendance excuse, thread participant,
    // message, action owner, notification recipient) require the Morgan
    // person row, which no declared base seed creates.
    expect(sql).toContain("'f3000000-0000-4000-8000-000000000007','Morgan','Example','Morgan'");
    expect(sql).toMatch(/INSERT INTO people\([\s\S]*?ON CONFLICT\(id\) DO NOTHING;/);
  });

  it("valor-curriculum-marketplace.sql avoids the reserved `grant` alias", () => {
    const sql = seed("valor-curriculum-marketplace.sql");
    expect(sql).not.toMatch(/\baccount_person_grants\s+grant\b/);
    expect(sql).not.toMatch(/\bgrant\./);
  });

  it("valor-curriculum-marketplace.sql guards on current @valorschool.demo identities", () => {
    const sql = seed("valor-curriculum-marketplace.sql");
    expect(sql).not.toContain("@can-os.invalid");
    expect(sql).toContain("alex.registrar@valorschool.demo");
    expect(sql).toContain("jordan.student@valorschool.demo");
    expect(sql).toContain("riley.teacher@valorschool.demo");
    expect(sql).toContain("current_setting('can.seed_authorized',true) IS DISTINCT FROM 'valorschool'");
  });
});
