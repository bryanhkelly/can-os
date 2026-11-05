import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { AccessContext } from "@/domain/access-context";
import type { getCommandContext } from "@/modules/identity/command-context.server";

type Db = typeof import("@/db/client").db;
type Schema = typeof import("@/db/schema");
type MessagingContext = Awaited<ReturnType<typeof getCommandContext>>;
type ContactRelationship = { personId: string; relationship: string };

export async function listOnsiteContactRelationships(
  db: Db,
  schema: Schema,
  context: MessagingContext,
  siteIds: string[],
  programIds: string[],
): Promise<ContactRelationship[]> {
  if (!siteIds.length || !programIds.length) return [];
  const relationships: ContactRelationship[] = [];
  const leaders = await db.selectDistinct({
    personId: schema.accountPersonGrants.personId, role: schema.accountPersonGrants.role,
  }).from(schema.accountPersonGrants)
    .innerJoin(schema.programs, eq(schema.programs.organizationId, schema.accountPersonGrants.organizationId))
    .innerJoin(schema.accessAccounts, and(eq(schema.accessAccounts.id, schema.accountPersonGrants.accountId),
      eq(schema.accessAccounts.disabled, false), isNotNull(schema.accessAccounts.emailVerifiedAt)))
    .innerJoin(schema.people, and(eq(schema.people.id, schema.accountPersonGrants.personId), eq(schema.people.active, true)))
    .where(and(eq(schema.accountPersonGrants.active, true),
      inArray(schema.accountPersonGrants.role, ["registrar", "site_admin", "site_leader"]),
      inArray(schema.programs.id, programIds), inArray(schema.programs.siteId, siteIds),
      or(isNull(schema.accountPersonGrants.siteId), eq(schema.accountPersonGrants.siteId, schema.programs.siteId))));
  for (const leader of leaders) {
    relationships.push({ personId: leader.personId,
      relationship: `authorized school leader (${leader.role.replaceAll("_", " ")})` });
  }

  let facilitatorSections: string[] | null = null;
  if (context.role === "room_facilitator") {
    const { activeFacilitatorSectionIds } = await import("@/modules/operations/site-section-facilitators.server");
    facilitatorSections = [];
    for (const programId of programIds) {
      facilitatorSections.push(...await activeFacilitatorSectionIds(db, context as AccessContext, programId));
    }
    facilitatorSections = [...new Set(facilitatorSections)];
    if (!facilitatorSections.length) return relationships;
  }

  const teachers = await db.selectDistinct({
    personId: schema.sectionTeachers.personId, sectionTitle: schema.sections.title,
  }).from(schema.sectionTeachers)
    .innerJoin(schema.sections, eq(schema.sections.id, schema.sectionTeachers.sectionId))
    .innerJoin(schema.programs, eq(schema.programs.id, schema.sections.programId))
    .innerJoin(schema.accountPersonGrants, and(
      eq(schema.accountPersonGrants.personId, schema.sectionTeachers.personId),
      eq(schema.accountPersonGrants.organizationId, schema.programs.organizationId),
      eq(schema.accountPersonGrants.role, "teacher"), eq(schema.accountPersonGrants.active, true),
      or(isNull(schema.accountPersonGrants.siteId), eq(schema.accountPersonGrants.siteId, schema.programs.siteId))))
    .innerJoin(schema.accessAccounts, and(eq(schema.accessAccounts.id, schema.accountPersonGrants.accountId),
      eq(schema.accessAccounts.disabled, false), isNotNull(schema.accessAccounts.emailVerifiedAt)))
    .innerJoin(schema.people, and(eq(schema.people.id, schema.sectionTeachers.personId), eq(schema.people.active, true)))
    .where(and(eq(schema.sections.active, true), eq(schema.sectionTeachers.role, "teacher"),
      inArray(schema.sections.siteId, siteIds), inArray(schema.sections.programId, programIds),
      ...(facilitatorSections ? [inArray(schema.sections.id, facilitatorSections)] : [])));
  for (const teacher of teachers) {
    relationships.push({ personId: teacher.personId, relationship: `${teacher.sectionTitle} teacher` });
  }
  return relationships;
}