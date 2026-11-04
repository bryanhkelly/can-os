import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accountPersonGrants, people, teacherProfessionalProfiles } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { teacherProfessionalProfileSchema } from "@/domain/teacher-professional-profile";
import { recordAudit, requireActor } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";

async function assertCurrentTeacher(
  actor: Awaited<ReturnType<typeof requireActor>>,
  executor: Pick<typeof db, "select"> = db,
) {
  const [grant] = await executor.select({ id: accountPersonGrants.id })
    .from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(and(
      eq(accountPersonGrants.id, actor.grantId),
      eq(accountPersonGrants.accountId, actor.accountId),
      eq(accountPersonGrants.personId, actor.actorPersonId),
      eq(accountPersonGrants.role, "teacher"),
      eq(accountPersonGrants.active, true),
      eq(people.active, true),
      inArray(accountPersonGrants.organizationId, actor.scope.organizationIds ?? []),
      actor.grantSiteId
        ? eq(accountPersonGrants.siteId, actor.grantSiteId)
        : or(isNull(accountPersonGrants.siteId), inArray(accountPersonGrants.siteId, actor.scope.siteIds ?? [])),
    )).limit(1);
  if (!grant) throw new AuthorizationError("current teacher membership");
}

export const getTeacherProfessionalProfile = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await requireActor(["teacher"], "profiles.professional_profile.manage");
  await assertCurrentTeacher(actor);
  const [profile] = await db.select({
    education: teacherProfessionalProfiles.education,
    teachingExperienceYears: teacherProfessionalProfiles.teachingExperienceYears,
    specialties: teacherProfessionalProfiles.specialties,
    updatedAt: teacherProfessionalProfiles.updatedAt,
  }).from(teacherProfessionalProfiles)
    .where(eq(teacherProfessionalProfiles.personId, actor.actorPersonId)).limit(1);
  return {
    education: profile?.education ?? [],
    teachingExperienceYears: profile?.teachingExperienceYears ?? null,
    specialties: profile?.specialties ?? [],
    updatedAt: profile?.updatedAt?.toISOString() ?? null,
  };
});

export const saveTeacherProfessionalProfile = createServerFn({ method: "POST" })
  .validator((value: unknown) => teacherProfessionalProfileSchema.parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["teacher"], "profiles.professional_profile.manage");
    await assertCurrentTeacher(actor);
    const profileData = teacherProfessionalProfileSchema.parse(data);
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"teacher-professional-profile:" + actor.actorPersonId}))`);
      await assertCurrentTeacher(actor, tx);
      const [current] = await tx.select().from(teacherProfessionalProfiles)
        .where(eq(teacherProfessionalProfiles.personId, actor.actorPersonId)).for("update").limit(1);
      const now = new Date();
      const values = {
        education: profileData.education,
        teachingExperienceYears: profileData.teachingExperienceYears,
        specialties: profileData.specialties,
        updatedAt: now,
      };
      let profileId: string;
      if (current) {
        const [updated] = await tx.update(teacherProfessionalProfiles).set(values)
          .where(eq(teacherProfessionalProfiles.id, current.id)).returning({ id: teacherProfessionalProfiles.id });
        if (!updated) throw new Error("Teacher professional profile was not updated");
        profileId = updated.id;
      } else {
        const [created] = await tx.insert(teacherProfessionalProfiles)
          .values({ personId: actor.actorPersonId, ...values })
          .returning({ id: teacherProfessionalProfiles.id });
        if (!created) throw new Error("Teacher professional profile was not created");
        profileId = created.id;
      }
      const summary = {
        educationCount: profileData.education.length,
        teachingExperienceRecorded: profileData.teachingExperienceYears !== null,
        specialtyCount: profileData.specialties.length,
      };
      await recordAudit(tx, actor, {
        action: "teacher.professional_profile.updated",
        resourceType: "teacher_professional_profile",
        resourceId: profileId,
        scope: {
          organizationId: actor.scope.organizationIds?.[0] ?? null,
          siteId: actor.grantSiteId,
        },
        before: current ? {
          educationCount: current.education.length,
          teachingExperienceRecorded: current.teachingExperienceYears !== null,
          specialtyCount: current.specialties.length,
        } : null,
        after: summary,
      });
      await emitEvent(tx, {
        eventType: EventTypes.TeacherProfessionalProfileUpdated,
        aggregateType: "TeacherProfessionalProfile",
        aggregateId: profileId,
        actorPersonId: actor.actorPersonId,
        organizationId: actor.scope.organizationIds?.[0] ?? null,
        siteId: actor.grantSiteId,
        payload: summary,
      });
      return { updatedAt: now.toISOString() };
    });
  });
