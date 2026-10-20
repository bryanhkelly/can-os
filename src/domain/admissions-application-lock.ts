import { sql } from "drizzle-orm";
import type { db } from "@/db/client";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function lockAdmissionsApplication(tx: Pick<Transaction, "execute">, applicationId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"admissions-application:" + applicationId}))`);
}
