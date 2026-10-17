import { sql } from "drizzle-orm";
import type { db } from "@/db/client";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * GF4 academic-time/attendance serialization contract.
 *
 * Every mutation that can change onsite-day eligibility for a site and every
 * attendance site-day validation acquires this site-scoped advisory transaction
 * lock before reading or writing calendar, schedule, or active school-year
 * state. This coordinates INSERT/DELETE as well as UPDATE (ordinary SELECT
 * FOR SHARE on existing rows cannot protect a previously missing calendar
 * day or new schedule version).
 *
 * Lock order:
 *   staff attendance: occurrence lock -> site configuration lock -> rows
 *   academic-time edits: site configuration lock -> rows
 * Academic-time edits must not try to acquire attendance occurrence locks.
 * A single site key is deliberately broader than calendar/version/day keys:
 * site-wide calendars and program-specific templates may coexist.
 */
export async function lockAttendanceConfigurationAtSite(
  tx: Transaction,
  siteId: string,
): Promise<void> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(siteId))
    throw new Error("An authorized school site is required for attendance configuration");
  const key = "attendance-config:site:" + siteId;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
}
