import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { organizations, programs } from "@/db/schema";

export function publicIntakePredicate() {
  return and(eq(programs.status, "active"), sql`${programs.metadata}->'admissionsOpen' = 'true'::jsonb`);
}

export async function publicIntakeProgram(programId: string, executor: Pick<typeof db, "select"> = db) {
  const [program] = await executor.select({
    id: programs.id, organizationId: programs.organizationId, siteId: programs.siteId,
    name: programs.name, gradeRange: programs.gradeRange,
  }).from(programs).where(and(eq(programs.id, programId), publicIntakePredicate())).for("share").limit(1);
  if (!program?.siteId) throw new Error("This program is not accepting online applications");
  return { ...program, siteId: program.siteId };
}

export async function publicIntakePrograms() {
  return db.select({
    id: programs.id, name: programs.name, school: organizations.name, schoolSlug: organizations.slug,
    gradeRange: programs.gradeRange,
  }).from(programs).innerJoin(organizations, eq(organizations.id, programs.organizationId))
    .where(and(publicIntakePredicate(), sql`${programs.siteId} is not null`))
    .orderBy(organizations.name, programs.name);
}
