import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { accountPersonGrants, people, studentProfiles } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { studentSelfProfileSchema } from "@/domain/student-self-profile";
import { recordAudit, requireActor } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";

async function assertCurrentStudent(
  actor: Awaited<ReturnType<typeof requireActor>>,
  executor: Pick<typeof db, "select"> = db,
) {
  const organizationId = actor.scope.organizationIds?.[0];
  if (!organizationId || !actor.grantSiteId) throw new AuthorizationError("current student membership");
  const [grant] = await executor.select({ id: accountPersonGrants.id })
    .from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .where(and(
      eq(accountPersonGrants.id, actor.grantId),
      eq(accountPersonGrants.accountId, actor.accountId),
      eq(accountPersonGrants.personId, actor.actorPersonId),
      eq(accountPersonGrants.role, "student"),
      eq(accountPersonGrants.active, true),
      eq(people.active, true),
      eq(accountPersonGrants.organizationId, organizationId),
      eq(accountPersonGrants.siteId, actor.grantSiteId),
    )).limit(1);
  if (!grant) throw new AuthorizationError("current student membership");
}

export const getStudentSelfProfile = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const actor = await requireActor(["student"], "profiles.self_profile.manage");
  await assertCurrentStudent(actor);
  const [[person], [profile]] = await Promise.all([
    db.select({ preferredName: people.preferredName }).from(people)
      .where(eq(people.id, actor.actorPersonId)).limit(1),
    db.select({
      preferredPronouns: studentProfiles.preferredPronouns,
      metadata: studentProfiles.metadata,
    }).from(studentProfiles).where(eq(studentProfiles.personId, actor.actorPersonId)).limit(1),
  ]);
  if (!person || !profile) throw new AuthorizationError("current student profile");
  const data = studentSelfProfileSchema.parse({
    preferredName: person.preferredName ?? null,
    preferredPronouns: profile.preferredPronouns ?? null,
    interests: profile.metadata.studentSelfProfileInterests ?? [],
  });
  return {
    preferredName: data.preferredName ?? "",
    preferredPronouns: data.preferredPronouns ?? "",
    interests: data.interests,
  };
});

export const saveStudentSelfProfile = createServerFn({ method: "POST" })
  .validator((value: unknown) => studentSelfProfileSchema.parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["student"], "profiles.self_profile.manage");
    await assertCurrentStudent(actor);
    const profileData = studentSelfProfileSchema.parse(data);
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"student-self-profile:" + actor.actorPersonId}))`);
      await assertCurrentStudent(actor, tx);
      const [person] = await tx.select({ id: people.id, preferredName: people.preferredName }).from(people)
        .where(eq(people.id, actor.actorPersonId)).for("update").limit(1);
      const [profile] = await tx.select({
        id: studentProfiles.id,
        preferredPronouns: studentProfiles.preferredPronouns,
        metadata: studentProfiles.metadata,
      }).from(studentProfiles)
        .where(eq(studentProfiles.personId, actor.actorPersonId)).for("update").limit(1);
      if (!person || !profile) throw new AuthorizationError("current student profile");
      const preferredName = profileData.preferredName || null;
      const preferredPronouns = profileData.preferredPronouns || null;
      const currentData = studentSelfProfileSchema.parse({
        preferredName: person.preferredName ?? null,
        preferredPronouns: profile.preferredPronouns ?? null,
        interests: profile.metadata.studentSelfProfileInterests ?? [],
      });
      await tx.update(people).set({ preferredName, updatedAt: new Date() })
        .where(eq(people.id, person.id));
      await tx.update(studentProfiles).set({
        preferredPronouns,
        metadata: { ...profile.metadata, studentSelfProfileInterests: profileData.interests },
        updatedAt: new Date(),
      }).where(eq(studentProfiles.id, profile.id));

      const summary = {
        preferredNameSet: preferredName !== null,
        pronounsSet: preferredPronouns !== null,
        interestCount: profileData.interests.length,
      };
      await recordAudit(tx, actor, {
        action: "student.self_profile.updated",
        resourceType: "student_profile",
        resourceId: profile.id,
        scope: {
          organizationId: actor.scope.organizationIds?.[0] ?? null,
          siteId: actor.grantSiteId,
        },
        before: {
          preferredNameSet: person.preferredName !== null,
          pronounsSet: profile.preferredPronouns !== null,
          interestCount: currentData.interests.length,
        },
        after: summary,
      });
      await emitEvent(tx, {
        eventType: EventTypes.StudentProfileUpdated,
        aggregateType: "StudentProfile",
        aggregateId: profile.id,
        actorPersonId: actor.actorPersonId,
        organizationId: actor.scope.organizationIds?.[0] ?? null,
        siteId: actor.grantSiteId,
        payload: summary,
      });
      return { saved: true };
    });
  });
