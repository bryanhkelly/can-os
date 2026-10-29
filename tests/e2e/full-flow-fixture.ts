import { createClient, type Client } from "@libsql/client";
import { sql as drizzleSql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { hash } from "@node-rs/argon2";

const dbUrl = process.env.DATABASE_URL ?? "file:./.data/can-os.db";

/**
 * FullFlow fixture seed
 *
 * Creates a complete graph of a small school with an admin, a teacher, a
 * guardian, a couple of learners, a class and enrolment, a published
 * compliance framework with one version + one rule, and an audit event. The
 * FullFlow spec then exercises every module UI against this data.
 *
 * The seed is designed to be re-runnable: rows are keyed by stable, obviously
 * fixture-only identifiers and inserted with INSERT OR IGNORE so repeated
 * local runs don't accumulate duplicates.
 */

const FIXTURE = {
  organization: {
    id: "ff-org-demo",
    name: "FullFlow Demo School",
    code: "FF-DEMO",
    timezone: "UTC",
  },
  users: [
    {
      id: "ff-user-admin",
      email: "ff-admin@example.test",
      firstName: "FullFlow",
      lastName: "Admin",
      role: "admin" as const,
    },
    {
      id: "ff-user-teacher",
      email: "ff-teacher@example.test",
      firstName: "FullFlow",
      lastName: "Teacher",
      role: "teacher" as const,
    },
    {
      id: "ff-user-guardian",
      email: "ff-guardian@example.test",
      firstName: "FullFlow",
      lastName: "Guardian",
      role: "guardian" as const,
    },
  ],
  password: "FullFlow!Passw0rd",
  learners: [
    {
      id: "ff-learner-1",
      learnerNumber: "FF-LRN-001",
      firstName: "Ava",
      lastName: "Fixture",
      grade: "5",
      homeroom: "FF-5A",
    },
    {
      id: "ff-learner-2",
      learnerNumber: "FF-LRN-002",
      firstName: "Ben",
      lastName: "Fixture",
      grade: "5",
      homeroom: "FF-5A",
    },
  ],
  class: {
    id: "ff-class-homeroom",
    name: "FF Homeroom 5A",
    code: "FF-HR-5A",
    gradeBand: "5",
    capacity: 30,
  },
  compliance: {
    framework: {
      id: "ff-framework-core",
      key: "ff-core-safety",
      name: "FF Core Safety Framework",
      publisher: "FullFlow Fixtures",
      status: "published",
    },
    version: {
      id: "ff-framework-version-1",
      key: "ff-core-safety-v1",
      version: 1,
      status: "published",
      effectiveFrom: "2024-01-01T00:00:00.000Z",
    },
    rule: {
      id: "ff-rule-attendance",
      key: "ff-attendance-required",
      name: "Attendance recorded daily",
      category: "attendance",
      severity: "medium",
      appliesTo: "teacher",
    },
  },
};

type InsertSpec = {
  table: string;
  columns: string[];
  values: unknown[][];
};

function placeholders(count: number): string {
  return `(${new Array(count).fill("?").join(", ")})`;
}

async function insertIgnore(client: Client, spec: InsertSpec): Promise<void> {
  const sql = `INSERT OR IGNORE INTO ${spec.table} (${spec.columns.join(", ")}) VALUES ${spec.values
    .map(() => placeholders(spec.columns.length))
    .join(", ")}`;
  const args = spec.values.flat();
  await client.execute({ sql, args });
}

export async function seedFullFlowFixture(): Promise<void> {
  const client = createClient({ url: dbUrl });
  const db = drizzle(client);
  const now = new Date().toISOString();
  const passwordHash = await hash(FIXTURE.password);

  await insertIgnore(client, {
    table: "organizations",
    columns: ["id", "name", "code", "timezone", "settings", "created_at", "updated_at"],
    values: [
      [
        FIXTURE.organization.id,
        FIXTURE.organization.name,
        FIXTURE.organization.code,
        FIXTURE.organization.timezone,
        JSON.stringify({ fixture: "full-flow" }),
        now,
        now,
      ],
    ],
  });

  await insertIgnore(client, {
    table: "users",
    columns: [
      "id",
      "organization_id",
      "email",
      "first_name",
      "last_name",
      "role",
      "status",
      "password_hash",
      "created_at",
      "updated_at",
    ],
    values: FIXTURE.users.map((user) => [
      user.id,
      FIXTURE.organization.id,
      user.email,
      user.firstName,
      user.lastName,
      user.role,
      "active",
      passwordHash,
      now,
      now,
    ]),
  });

  await insertIgnore(client, {
    table: "learners",
    columns: [
      "id",
      "organization_id",
      "learner_number",
      "first_name",
      "last_name",
      "grade",
      "homeroom",
      "status",
      "created_at",
      "updated_at",
    ],
    values: FIXTURE.learners.map((learner) => [
      learner.id,
      FIXTURE.organization.id,
      learner.learnerNumber,
      learner.firstName,
      learner.lastName,
      learner.grade,
      learner.homeroom,
      "active",
      now,
      now,
    ]),
  });

  await insertIgnore(client, {
    table: "classes",
    columns: [
      "id",
      "organization_id",
      "name",
      "code",
      "grade_band",
      "capacity",
      "teacher_id",
      "created_at",
      "updated_at",
    ],
    values: [
      [
        FIXTURE.class.id,
        FIXTURE.organization.id,
        FIXTURE.class.name,
        FIXTURE.class.code,
        FIXTURE.class.gradeBand,
        FIXTURE.class.capacity,
        "ff-user-teacher",
        now,
        now,
      ],
    ],
  });

  await insertIgnore(client, {
    table: "enrollments",
    columns: [
      "id",
      "organization_id",
      "class_id",
      "learner_id",
      "status",
      "enrolled_at",
      "created_at",
      "updated_at",
    ],
    values: FIXTURE.learners.map((learner, index) => [
      `ff-enrollment-${index + 1}`,
      FIXTURE.organization.id,
      FIXTURE.class.id,
      learner.id,
      "active",
      now,
      now,
      now,
    ]),
  });

  await insertIgnore(client, {
    table: "guardian_learner_links",
    columns: ["id", "organization_id", "guardian_id", "learner_id", "relationship", "created_at"],
    values: FIXTURE.learners.map((learner, index) => [
      `ff-guardian-link-${index + 1}`,
      FIXTURE.organization.id,
      "ff-user-guardian",
      learner.id,
      "parent",
      now,
    ]),
  });

  await insertIgnore(client, {
    table: "compliance_frameworks",
    columns: [
      "id",
      "organization_id",
      "key",
      "name",
      "publisher",
      "status",
      "created_at",
      "updated_at",
    ],
    values: [
      [
        FIXTURE.compliance.framework.id,
        FIXTURE.organization.id,
        FIXTURE.compliance.framework.key,
        FIXTURE.compliance.framework.name,
        FIXTURE.compliance.framework.publisher,
        FIXTURE.compliance.framework.status,
        now,
        now,
      ],
    ],
  });

  await insertIgnore(client, {
    table: "compliance_framework_versions",
    columns: [
      "id",
      "organization_id",
      "framework_id",
      "key",
      "version",
      "status",
      "effective_from",
      "created_at",
      "updated_at",
    ],
    values: [
      [
        FIXTURE.compliance.version.id,
        FIXTURE.organization.id,
        FIXTURE.compliance.framework.id,
        FIXTURE.compliance.version.key,
        FIXTURE.compliance.version.version,
        FIXTURE.compliance.version.status,
        FIXTURE.compliance.version.effectiveFrom,
        now,
        now,
      ],
    ],
  });

  await insertIgnore(client, {
    table: "compliance_rules",
    columns: [
      "id",
      "organization_id",
      "framework_version_id",
      "key",
      "name",
      "category",
      "severity",
      "applies_to",
      "created_at",
      "updated_at",
    ],
    values: [
      [
        FIXTURE.compliance.rule.id,
        FIXTURE.organization.id,
        FIXTURE.compliance.version.id,
        FIXTURE.compliance.rule.key,
        FIXTURE.compliance.rule.name,
        FIXTURE.compliance.rule.category,
        FIXTURE.compliance.rule.severity,
        FIXTURE.compliance.rule.appliesTo,
        now,
        now,
      ],
    ],
  });

  await insertIgnore(client, {
    table: "audit_events",
    columns: [
      "id",
      "organization_id",
      "actor_id",
      "action",
      "entity_type",
      "entity_id",
      "metadata",
      "created_at",
    ],
    values: [
      [
        "ff-audit-seed",
        FIXTURE.organization.id,
        "ff-user-admin",
        "fixture.seed",
        "organization",
        FIXTURE.organization.id,
        JSON.stringify({ fixture: "full-flow" }),
        now,
      ],
    ],
  });

  // Sanity check: fail fast if the schema drifted so e2e errors are clear.
  const counts = await db.all<{ table_name: string; cnt: number }>(
    drizzleSql`SELECT 'users' AS table_name, COUNT(*) AS cnt FROM users WHERE id LIKE 'ff-%'
     UNION ALL SELECT 'learners', COUNT(*) FROM learners WHERE id LIKE 'ff-%'
     UNION ALL SELECT 'classes', COUNT(*) FROM classes WHERE id = 'ff-class-homeroom'`
  );
  const missing = counts.filter((row) => Number(row.cnt) === 0);
  if (missing.length > 0) {
    throw new Error(
      `FullFlow fixture seed incomplete for tables: ${missing.map((row) => row.table_name).join(", ")}`
    );
  }

  client.close();
}

export const fullFlowCredentials = {
  admin: { email: "ff-admin@example.test", password: FIXTURE.password },
  teacher: { email: "ff-teacher@example.test", password: FIXTURE.password },
  guardian: { email: "ff-guardian@example.test", password: FIXTURE.password },
};

export const fullFlowIdentifiers = {
  organizationId: FIXTURE.organization.id,
  learnerNumbers: FIXTURE.learners.map((learner) => learner.learnerNumber),
  classCode: FIXTURE.class.code,
};
