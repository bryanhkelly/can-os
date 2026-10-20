import { readFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import type { Database } from "@/db/client";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function enablePublishedPolicyInRollback(tx: Transaction) {
  const labels = await tx.execute(sql`select enumlabel from pg_enum
    where enumtypid = 'compliance_framework_version_status'::regtype`);
  if (labels.rows.some(row => row.enumlabel === "published")) return;
  // A newly created enum may use an added value in the same transaction.
  // Replacing the type here tests the migration without committing its DDL.
  await tx.execute(sql`alter type compliance_framework_version_status rename to launch_test_previous_status`);
  await tx.execute(sql`create type compliance_framework_version_status as enum ('draft')`);
  await tx.execute(sql.raw(readFileSync("drizzle\\0024_quick_scalphunter.sql", "utf8")));
  await tx.execute(sql`alter table compliance_framework_versions alter column status drop default`);
  await tx.execute(sql`alter table compliance_framework_versions alter column status type compliance_framework_version_status
    using status::text::compliance_framework_version_status`);
  await tx.execute(sql`alter table compliance_framework_versions alter column status set default 'draft'`);
}
