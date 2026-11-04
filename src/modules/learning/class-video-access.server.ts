import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { courseTemplateVersions, programs, sections } from "@/db/schema";
import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { hasRegistrarAuthority } from "@/domain/school-roles";
import type { Actor } from "@/modules/identity/actors.server";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";
import { authorizeClass, type ClassTransaction } from "./class-access.server";

export async function authorizeClassVideoManager(actor: Actor, sectionId: string, tx?: ClassTransaction) {
  if (actor.role === "teacher") {
    assertCapability(actor, "teacher:read");
    return (await authorizeClass(actor, sectionId, undefined, tx)).section;
  }
  if (!hasRegistrarAuthority(actor.role)) throw new AuthorizationError("class video manager");
  const query = tx ?? db;
  const [row] = await query.select({
    id: sections.id, programId: sections.programId, siteId: sections.siteId,
    versionId: sections.courseTemplateVersionId, curriculum: courseTemplateVersions.curriculum,
    contentStatus: courseTemplateVersions.status, program: programs,
  }).from(sections)
    .innerJoin(courseTemplateVersions, eq(courseTemplateVersions.id, sections.courseTemplateVersionId))
    .innerJoin(programs, eq(programs.id, sections.programId))
    .where(and(eq(sections.id, sectionId), eq(sections.active, true))).limit(1);
  if (!row || row.siteId !== row.program.siteId ||
    !await hasInstitutionalProgramCapability(actor, row.program, "curriculum.publish", query) &&
    !await hasInstitutionalProgramCapability(actor, row.program, "curriculum.adopt", query))
    throw new AuthorizationError("institutional curriculum management for class program and site");
  return row;
}
