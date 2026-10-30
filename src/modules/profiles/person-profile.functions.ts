import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { verifiedPrivateDocumentPredicate } from "@/domain/private-document";
import { matchesEnrollmentDocumentSignature } from "@/domain/enrollment-document-signature";
import { requireActor, recordAudit, type Actor } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";
import { createPrivateUploadUrl, signPrivateObjectUrl, verifyPrivateObject } from "@/platform/storage/r2";

const selection = z.object({ personId: z.string().uuid().optional() });
const photoKeyPattern = /^profiles\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/i;
const upload = z.object({
  fileName: z.string().trim().min(1).max(150), mimeType: z.enum(["image/jpeg", "image/png"]),
  size: z.number().int().min(16).max(2 * 1024 * 1024),
});
async function actor() {
  return requireActor(["student", "guardian", "teacher", "registrar", "specialist", "counselor", "room_facilitator", "site_leader", "site_staff"]);
}
async function authorizedProfile(viewer: Actor, personId: string) {
  const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
  const [person] = await db.select({ id: s.people.id, firstName: s.people.legalFirstName,
    lastName: s.people.legalLastName, preferredName: s.people.preferredName }).from(s.people)
    .where(and(eq(s.people.id, personId), eq(s.people.active, true))).limit(1);
  if (!person) throw new AuthorizationError("active person profile");
  const sites = viewer.scope.siteIds ?? [], programs = viewer.scope.programIds ?? [];
  const scoped = and(eq(s.sections.active, true), inArray(s.sections.siteId, sites), inArray(s.sections.programId, programs));
  const teaching = await db.select({ id: s.sections.id, title: s.sections.title }).from(s.sectionTeachers)
    .innerJoin(s.sections, eq(s.sections.id, s.sectionTeachers.sectionId))
    .where(and(eq(s.sectionTeachers.personId, personId), scoped));
  const enrolled = await db.select({ id: s.sections.id, title: s.sections.title }).from(s.studentProfiles)
    .innerJoin(s.enrollments, eq(s.enrollments.studentProfileId, s.studentProfiles.id))
    .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId))
    .where(and(eq(s.studentProfiles.personId, personId), eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active"), scoped));
  let sections = [...teaching, ...enrolled];
  if (personId !== viewer.actorPersonId) {
    if (!sites.length || !programs.length) throw new AuthorizationError("profile delivery scope");
    if (viewer.role === "student" || viewer.role === "guardian") {
      const own = db.select({ sectionId: s.sections.id }).from(s.studentProfiles)
        .innerJoin(s.enrollments, eq(s.enrollments.studentProfileId, s.studentProfiles.id))
        .innerJoin(s.sections, eq(s.sections.id, s.enrollments.sectionId));
      const conditions = and(eq(s.enrollments.kind, "section"), eq(s.enrollments.status, "active"), scoped);
      const visible = viewer.role === "student"
        ? await own.where(and(conditions, eq(s.studentProfiles.personId, viewer.actorPersonId)))
        : await own.innerJoin(s.guardianRelationships, eq(s.guardianRelationships.studentPersonId, s.studentProfiles.personId))
          .where(and(conditions, guardianRelationshipPredicate({
            guardianPersonId: viewer.actorPersonId, access: "academic",
          })));
      const ids = new Set(visible.map(row => row.sectionId));
      // Families see their actual teachers, not other students in a shared class.
      sections = teaching.filter(section => ids.has(section.id));
      if (viewer.role === "guardian" && enrolled.length) {
        const [relationship] = await db.select({ id: s.guardianRelationships.id }).from(s.guardianRelationships)
          .where(guardianRelationshipPredicate({
            guardianPersonId: viewer.actorPersonId, studentPersonId: personId, access: "academic",
          })).limit(1);
        if (relationship) sections = enrolled;
      }
    } else if (viewer.role === "teacher" && enrolled.length) {
      const assigned = await db.select({ id: s.sectionTeachers.sectionId }).from(s.sectionTeachers)
        .where(eq(s.sectionTeachers.personId, viewer.actorPersonId));
      sections = enrolled.filter(section => assigned.some(row => row.id === section.id));
    }
    if (!sections.length) throw new AuthorizationError("current profile relationship");
  }
  return { person, sections: [...new Map(sections.map(section => [section.id, section])).values()],
    kind: teaching.length ? "Teacher" : enrolled.length ? "Student" : "Member" };
}

export const getPersonProfile = createServerFn({ method: "GET" })
  .validator((value: unknown) => selection.parse(value ?? {}))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const viewer = await actor(), personId = data.personId ?? viewer.actorPersonId;
    const profile = await authorizedProfile(viewer, personId);
    return { personId, name: `${profile.person.preferredName ?? profile.person.firstName} ${profile.person.lastName}`,
      kind: profile.kind, sections: profile.sections, isSelf: personId === viewer.actorPersonId,
      viewerRole: viewer.role };
  });

export const getProfilePhoto = createServerFn({ method: "GET" })
  .validator((value: unknown) => selection.parse(value ?? {}))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const viewer = await actor(), personId = data.personId ?? viewer.actorPersonId;
    await authorizedProfile(viewer, personId);
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    const [photo] = await db.select({ key: s.documents.storageKey, mimeType: s.documents.mimeType }).from(s.documents)
      .where(verifiedPrivateDocumentPredicate({
        subjectType: "person", subjectId: personId, category: "profile_photo", sensitivityTier: "standard",
      }))
      .orderBy(desc(s.documents.createdAt), desc(s.documents.id)).limit(1);
    if (!photo) return { url: null };
    if (!photo.key.startsWith(`profiles/${personId}/`) || !photoKeyPattern.test(photo.key) ||
      !["image/jpeg", "image/png"].includes(photo.mimeType ?? "")) throw new Error("Profile photo record has an invalid storage contract.");
    return { url: signPrivateObjectUrl({ method: "GET", key: photo.key, keyPattern: photoKeyPattern, expiresSeconds: 300 }) };
  });

export const beginProfilePhotoUpload = createServerFn({ method: "POST" })
  .validator((value: unknown) => upload.parse(value))
  .handler(async ({ data }) => {
    const viewer = await actor();
    await authorizedProfile(viewer, viewer.actorPersonId);
    const key = `profiles/${viewer.actorPersonId}/${crypto.randomUUID()}`;
    return { key, uploadUrl: createPrivateUploadUrl({ key, keyPattern: photoKeyPattern,
      contentType: data.mimeType, contentLength: data.size, minContentLength: 16, maxContentLength: 2 * 1024 * 1024, expiresSeconds: 180 }) };
  });

export const finishProfilePhotoUpload = createServerFn({ method: "POST" })
  .validator((value: unknown) => upload.extend({ key: z.string().regex(photoKeyPattern) }).parse(value))
  .handler(async ({ data }) => {
    const viewer = await actor();
    await authorizedProfile(viewer, viewer.actorPersonId);
    if (!data.key.startsWith(`profiles/${viewer.actorPersonId}/`)) throw new AuthorizationError("own profile photo upload");
    await verifyPrivateObject({ key: data.key, keyPattern: photoKeyPattern, expectedSize: data.size,
      expectedContentType: data.mimeType, verifySignature: matchesEnrollmentDocumentSignature });
    const [{ db }, s] = await Promise.all([import("@/db/client"), import("@/db/schema")]);
    return db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"profile-photo:" + viewer.actorPersonId}))`);
      const [prior] = await tx.select({ id: s.documents.id }).from(s.documents).where(and(eq(s.documents.subjectType, "person"),
        eq(s.documents.subjectId, viewer.actorPersonId), eq(s.documents.category, "profile_photo"), eq(s.documents.storageKey, data.key))).limit(1);
      if (prior) return { documentId: prior.id };
      const [document] = await tx.insert(s.documents).values({
        subjectType: "person", subjectId: viewer.actorPersonId, category: "profile_photo", fileName: data.fileName,
        storageProvider: "cloudflare_r2", storageKey: data.key, mimeType: data.mimeType, sensitivityTier: "standard",
        verifiedAt: new Date(), uploadedByPersonId: viewer.actorPersonId, metadata: { size: data.size },
      }).returning({ id: s.documents.id });
      if (!document) throw new Error("Profile photo could not be saved.");
      await recordAudit(tx, viewer, { action: "profile.photo_changed", resourceType: "document", resourceId: document.id,
        after: { personId: viewer.actorPersonId } });
      await emitEvent(tx, { eventType: EventTypes.ProfilePhotoChanged, aggregateType: "person", aggregateId: viewer.actorPersonId,
        actorPersonId: viewer.actorPersonId, payload: { documentId: document.id } });
      return { documentId: document.id };
    });
  });
