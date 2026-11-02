import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { curriculumImportJobs } from "@/db/schema";
import type { Actor } from "@/modules/identity/actors.server";
import { emitEvent, writeAudit } from "@/platform/mutation";

export async function persistCurriculumImportJob<Report extends Record<string, unknown>>(input: {
  actor: Actor;
  organizationId: string;
  programId: string;
  format: string;
  formatVersion: string;
  sourceName: string;
  sha256: string;
  status: string;
  report: Report;
  metadata: Record<string, unknown>;
  auditAction: string;
  auditAfter: Record<string, unknown>;
  eventType: string;
}): Promise<{ importId: string; status: string; previouslyValidated: boolean }> {
  return db.transaction(async tx => {
    const [previous] = await tx.select({
      id: curriculumImportJobs.id,
      status: curriculumImportJobs.status,
    }).from(curriculumImportJobs).where(and(
      eq(curriculumImportJobs.organizationId, input.organizationId),
      eq(curriculumImportJobs.format, input.format),
      eq(curriculumImportJobs.sha256, input.sha256),
    )).limit(1);
    if (previous) return {
      importId: previous.id,
      status: previous.status,
      previouslyValidated: true,
    };

    const [job] = await tx.insert(curriculumImportJobs).values({
      organizationId: input.organizationId,
      format: input.format,
      formatVersion: input.formatVersion,
      sourceName: input.sourceName,
      sha256: input.sha256,
      status: input.status,
      report: input.report,
      metadata: input.metadata,
    }).returning({ id: curriculumImportJobs.id });
    if (!job) throw new Error("Unable to record curriculum import.");

    await writeAudit(tx, input.actor, {
      action: input.auditAction,
      entityType: "curriculum_import_job",
      entityId: job.id,
      scope: { organizationId: input.organizationId, programId: input.programId },
      after: input.auditAfter,
    });
    await emitEvent(tx, {
      eventType: input.eventType,
      aggregateType: "curriculum_import_job",
      aggregateId: job.id,
      actorPersonId: input.actor.actorPersonId,
      organizationId: input.organizationId,
      programId: input.programId,
    });
    return { importId: job.id, status: input.status, previouslyValidated: false };
  });
}
