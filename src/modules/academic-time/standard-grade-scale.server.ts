import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { gradeScales } from "@/db/schema";
import { assertCapability, assertOrganizationScope, type CommandContext } from "@/domain/command-context";
import { writeAudit } from "@/platform/mutation";

/** One canonical, retry-safe A-F scale used by both Studio and Launch Mode.
 * This is a draft school configuration default, not approval of local policy.
 */
export async function ensureStandardGradeScale(
  actor: CommandContext,
  input: { organizationId: string; name: string },
): Promise<string> {
  assertCapability(actor, "academic_year.manage");
  assertOrganizationScope(actor, input.organizationId);
  return db.transaction(async tx => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"grade-scale:" + input.organizationId + ":" + input.name}))`);
    const [existing] = await tx.select({
      id: gradeScales.id, active: gradeScales.active,
    }).from(gradeScales).where(and(
      eq(gradeScales.owningOrganizationId, input.organizationId),
      eq(gradeScales.name, input.name), eq(gradeScales.version, 1),
    )).limit(1);
    if (existing) {
      if (!existing.active) throw new Error("Existing grade scale is inactive; review instead of recreating it");
      return existing.id;
    }
    const [scale] = await tx.insert(gradeScales).values({
      owningOrganizationId: input.organizationId,
      name: input.name, version: 1, active: true,
      configuration: { entries: [
        { label: "A", minPercent: 90, maxPercent: 100, gpaPoints: 4, passing: true },
        { label: "B", minPercent: 80, maxPercent: 89.99, gpaPoints: 3, passing: true },
        { label: "C", minPercent: 70, maxPercent: 79.99, gpaPoints: 2, passing: true },
        { label: "D", minPercent: 60, maxPercent: 69.99, gpaPoints: 1, passing: true },
        { label: "F", minPercent: 0, maxPercent: 59.99, gpaPoints: 0, passing: false },
      ] },
    }).returning({ id: gradeScales.id });
    if (!scale) throw new Error("Unable to prepare grade scale");
    await writeAudit(tx, actor, {
      action: "grade_scale.create", entityType: "grade_scale", entityId: scale.id,
      scope: { organizationId: input.organizationId },
      after: { name: input.name, version: 1, source: "canonical_academic_preparation" },
    });
    return scale.id;
  });
}
