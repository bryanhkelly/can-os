import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray, isNotNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  courses, courseVersions, instructionalTracks, instructionalTrackVersions,
  instructionalTrackReviews, professionalRoleAssignments,
} from "@/db/canonical-v301";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertTrackProvider } from "./instructional-track-access.server";
import { readCreatorTrackDraft } from "./instructional-track-authoring.server";
import { requireProviderContentRole, providerContentCapability } from "@/domain/provider-content-workspace-access";
import { AuthorizationError } from "@/domain/command-context";

const noStore = () => setResponseHeader("Cache-Control", "private, no-store");

export const getProviderContentWorkspace = createServerFn({ method: "GET" }).handler(async () => {
  noStore();
  const actor = await getCommandContext(getRequest());
  const role = requireProviderContentRole(actor.role);
  if (!actor.actorPersonId || actor.grantSiteId !== null || actor.sessionAccountId) {
    throw new AuthorizationError("verified organization-only provider content membership");
  }
  const organizationId = actor.scope.organizationIds?.[0];
  if (!organizationId) throw new AuthorizationError("provider organization scope");
  const capability = providerContentCapability(role);

  // A general organization grant is not course authority. Candidate course IDs
  // come from named assignments; every one is independently revalidated against
  // current evidence, membership and effective dates in the command service.
  return db.transaction(async tx => {
    const candidates = await tx.select({ courseId: professionalRoleAssignments.courseId })
      .from(professionalRoleAssignments)
      .where(and(
        eq(professionalRoleAssignments.personId, actor.actorPersonId!),
        eq(professionalRoleAssignments.organizationId, organizationId),
        eq(professionalRoleAssignments.appointingOrganizationId, organizationId),
        eq(professionalRoleAssignments.roleCode, role),
        eq(professionalRoleAssignments.state, "approved"),
        isNotNull(professionalRoleAssignments.courseId),
      )).limit(301);
    const ids = [...new Set(candidates.flatMap(item => item.courseId ? [item.courseId] : []))];
    if (!ids.length) return { role, courses: [], tracks: [], assignmentsLimited: false };
    const courseRows = await tx.select({
      id: courses.id, title: courses.title, code: courses.courseCode,
      publisherOrganizationId: courses.publisherOrganizationId,
    }).from(courses).where(and(
      inArray(courses.id, ids), eq(courses.publisherOrganizationId, organizationId),
    )).orderBy(courses.title);
    const authorized = [];
    for (const course of courseRows) {
      try {
        await assertTrackProvider(tx, actor, {
          organizationId: course.publisherOrganizationId,
          courseId: course.id, capability,
        });
        authorized.push(course);
      } catch (cause) {
        if (!(cause instanceof AuthorizationError)) throw cause;
      }
    }
    if (!authorized.length) return { role, courses: [], tracks: [], assignmentsLimited: candidates.length > 300 };
    const allowedIds = authorized.map(course => course.id);
    const [versions, tracks] = await Promise.all([
      tx.select({
        id: courseVersions.id, courseId: courseVersions.courseId,
        versionNo: courseVersions.versionNo, lifecycle: courseVersions.lifecycle,
      }).from(courseVersions).where(inArray(courseVersions.courseId, allowedIds)),
      tx.select({
        id: instructionalTrackVersions.id,
        trackId: instructionalTracks.id,
        courseId: instructionalTrackVersions.courseId,
        title: instructionalTracks.title,
        presenterPersonId: instructionalTracks.presenterPersonId,
        createdByPersonId: instructionalTrackVersions.createdByPersonId,
        versionNo: instructionalTrackVersions.versionNo,
        trackKind: instructionalTrackVersions.trackKind,
        lifecycle: instructionalTrackVersions.lifecycle,
        submittedAt: instructionalTrackVersions.submittedAt,
        submissionManifestHash: instructionalTrackVersions.submissionManifestHash,
      }).from(instructionalTrackVersions)
        .innerJoin(instructionalTracks, eq(instructionalTracks.id, instructionalTrackVersions.instructionalTrackId))
        .where(and(
          inArray(instructionalTrackVersions.courseId, allowedIds),
          eq(instructionalTracks.producerOrganizationId, organizationId),
        )).orderBy(desc(instructionalTrackVersions.versionNo)).limit(501),
    ]);
    const visible = tracks.filter(track => role === "academic_content_creator"
      ? track.createdByPersonId === actor.actorPersonId
      : !!track.submissionManifestHash &&
        track.createdByPersonId !== actor.actorPersonId &&
        track.presenterPersonId !== actor.actorPersonId);
    const trackIds = visible.map(track => track.id);
    const reviews = trackIds.length ? await tx.select({
      trackVersionId: instructionalTrackReviews.trackVersionId,
      manifestHash: instructionalTrackReviews.manifestHash,
      kind: instructionalTrackReviews.reviewKind,
      decision: instructionalTrackReviews.decision,
      reviewerPersonId: instructionalTrackReviews.reviewerPersonId,
    }).from(instructionalTrackReviews)
      .where(inArray(instructionalTrackReviews.trackVersionId, trackIds))
      .orderBy(desc(instructionalTrackReviews.decisionOrder)).limit(2000) : [];
    const resultTracks = visible.map(track => {
      const seen = new Set<string>();
      const latestReviews = reviews.filter(review => {
        if (review.trackVersionId !== track.id ||
            review.manifestHash !== track.submissionManifestHash ||
            seen.has(review.kind)) return false;
        seen.add(review.kind);
        return true;
      }).map(review => ({ kind: review.kind, decision: review.decision }));
      return { ...track, reviews: latestReviews };
    });
    return {
      role,
      assignmentsLimited: candidates.length > 300 || tracks.length > 500 || reviews.length === 2000,
      courses: authorized.map(course => ({
        id: course.id, title: course.title, code: course.code,
        publishedVersions: versions
          .filter(version => version.courseId === course.id && version.lifecycle === "published")
          .sort((a,b) => b.versionNo - a.versionNo)
          .map(version => ({id:version.id, versionNo:version.versionNo})),
      })),
      tracks: resultTracks,
    };
  });
});

/** Reads an author's own exact draft, never a shared reviewer or student view. */
export const getCreatorInstructionalDraft = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({trackVersionId:z.string().uuid()}).strict().parse(value))
  .handler(async ({data}) => {
    noStore();
    const actor = await getCommandContext(getRequest());
    if (requireProviderContentRole(actor.role) !== "academic_content_creator") {
      throw new AuthorizationError("content creator workspace");
    }
    return readCreatorTrackDraft(actor, data.trackVersionId);
  });
