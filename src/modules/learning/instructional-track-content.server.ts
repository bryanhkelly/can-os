import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { courseTemplates, courseTemplateVersions, curriculumResources, documents, instructionalTrackActivities,
  instructionalTrackActivitySecrets, instructionalTrackLessons, instructionalTracks, instructionalTrackVersions,
  instructionalTrackResourceSnapshots, instructionalTrackWithdrawals, people } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { readClassContent } from "@/domain/class-content";
import { resolveClassVideo } from "@/domain/class-video";
import { parseStudentPracticeBody, trackContentAvailable } from "@/domain/instructional-tracks";
import { hashInstructionalTrackManifest } from "./instructional-track-manifest.server";
import { requireCurrentTrackPresenter, type TrackTx } from "./instructional-track-access.server";

export class TrackContentError extends Error {}

export const trackSolutionSchema = z.array(z.object({ promptKey: z.string().min(1).max(100),
  answer: z.string().min(1).max(5000), explanation: z.string().max(10000) }).strict()).max(100);
export const trackPrivateKeyPattern = /^learning\/instructional-tracks\/[a-f0-9-]{36}\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i;
const json = (value: unknown) => JSON.parse(JSON.stringify(value));

export async function readTrackBundle(tx: TrackTx, versionId: string, lock: "share" | "update" = "share") {
  const [version] = await tx.select().from(instructionalTrackVersions).where(eq(instructionalTrackVersions.id, versionId)).for(lock).limit(1);
  if (!version) throw new AuthorizationError("existing instructional track version");
  const [track] = await tx.select().from(instructionalTracks).where(eq(instructionalTracks.id, version.trackId)).for("share").limit(1);
  const [course] = await tx.select({ id: courseTemplateVersions.id, courseId: courseTemplateVersions.courseTemplateId,
    ownerId: courseTemplates.owningOrganizationId, status: courseTemplateVersions.status, curriculum: courseTemplateVersions.curriculum })
    .from(courseTemplateVersions).innerJoin(courseTemplates, eq(courseTemplates.id, courseTemplateVersions.courseTemplateId))
    .where(eq(courseTemplateVersions.id, version.courseTemplateVersionId)).for("share").limit(1);
  if (!track || !course || course.courseId !== track.courseTemplateId) throw new AuthorizationError("matching instructional course");
  const lessons = await tx.select().from(instructionalTrackLessons).where(eq(instructionalTrackLessons.trackVersionId, version.id))
    .orderBy(asc(instructionalTrackLessons.publisherLessonId), asc(instructionalTrackLessons.placement), asc(instructionalTrackLessons.sequence));
  const activities = await tx.select().from(instructionalTrackActivities).where(eq(instructionalTrackActivities.trackVersionId, version.id))
    .orderBy(asc(instructionalTrackActivities.activityKey));
  const secrets = activities.length ? await tx.select().from(instructionalTrackActivitySecrets)
    .where(inArray(instructionalTrackActivitySecrets.activityId, activities.map(a => a.id))).orderBy(asc(instructionalTrackActivitySecrets.activityId)) : [];
  const resourceIds = [...new Set([version.rightsEvidenceResourceId, ...lessons.flatMap(l => [l.resourceId, l.captionResourceId, l.transcriptResourceId]),
    ...activities.map(a => a.resourceId)].filter((id): id is string => Boolean(id)))];
  const currentResources = resourceIds.length ? await tx.select().from(curriculumResources).where(inArray(curriculumResources.id, resourceIds))
    .for("share").orderBy(asc(curriculumResources.id)) : [];
  const [snapshot] = await tx.select().from(instructionalTrackResourceSnapshots)
    .where(eq(instructionalTrackResourceSnapshots.trackVersionId, version.id)).limit(1);
  const resources = snapshot ? snapshot.resources.map(resource => ({
    ...resource, createdAt: new Date(resource.createdAt), updatedAt: new Date(resource.updatedAt),
  })) : currentResources;
  const currentById = new Map(currentResources.map(resource => [resource.id, resource]));
  // A catalog edit can supply a different title or URL for the next release.
  // Changes to ownership, visibility, licensing or the verified document binding still block delivery.
  const currentResourceAuthority = resources.length === resourceIds.length &&
    resources.every(resource => {
      const current = currentById.get(resource.id);
      return !!current && current.ownerOrganizationId === resource.ownerOrganizationId &&
        current.licenseCode === resource.licenseCode && current.documentId === resource.documentId &&
        current.metadata.audience === resource.metadata.audience;
    });
  const documentIds = resources.flatMap(r => r.documentId ? [r.documentId] : []);
  const docs = documentIds.length ? await tx.select().from(documents).where(inArray(documents.id, documentIds))
    .for("share").orderBy(asc(documents.id)) : [];
  const restrictions = await tx.select().from(instructionalTrackWithdrawals).where(eq(instructionalTrackWithdrawals.trackVersionId, version.id));
  const computedManifestHash = hashInstructionalTrackManifest({ courseTemplateVersionId: course.id,
    presenterPersonId: track.presenterPersonId, producerOrganizationId: track.producerOrganizationId,
    lessons: json(lessons), activities: json(activities), privateSolutions: json(secrets), resourceSnapshots: json([...resources, ...docs]),
    rights: json({ trackTitle: track.title, trackSlug: track.slug, authorPersonId: version.createdByPersonId,
      evidenceResourceId: version.rightsEvidenceResourceId, expiresAt: version.rightsExpiresAt,
      sourceCurriculum: course.curriculum, courseOwnerId: course.ownerId }) });
  return { version, track, course, lessons, activities, secrets, resources, docs, restrictions,
    currentResourceAuthority, computedManifestHash };
}
export type TrackBundle = Awaited<ReturnType<typeof readTrackBundle>>;

export async function sealTrackResources(tx: TrackTx, bundle: TrackBundle) {
  await tx.insert(instructionalTrackResourceSnapshots).values({
    trackVersionId: bundle.version.id,
    resources: bundle.resources.map(resource => ({
      ...resource, createdAt: resource.createdAt.toISOString(), updatedAt: resource.updatedAt.toISOString(),
    })),
  });
}

/** Whole-manifest structural gate. Academic/rights/accessibility/safety decisions are separate.
 * A role grant, external URL or synthetic profile is never itself content approval.
 */
export async function assertTrackContentReady(tx: TrackTx, bundle: TrackBundle, now = new Date(), draft = false) {
  const { version, track, course, lessons, activities, secrets, resources, docs } = bundle;
  if (!bundle.currentResourceAuthority) throw new TrackContentError("Current ownership, license and visibility are required for approved track resources.");
  const [presenter] = await tx.select({ id: people.id }).from(people)
    .where(and(eq(people.id, track.presenterPersonId), eq(people.active, true))).for("share").limit(1);
  if (!presenter || course.status !== "published" || course.ownerId !== track.producerOrganizationId)
    throw new AuthorizationError("active presenter and provider-owned published course");
  const content = readClassContent(course.curriculum);
  const lessonIds = content?.modules.flatMap(m => m.lessons.map(l => l.id)) ?? [];
  if (!lessonIds.length || (!draft && lessonIds.some(id => !lessons.some(l => l.publisherLessonId === id && l.placement === "primary"))) ||
    [...lessons, ...activities].some(item => !lessonIds.includes(item.publisherLessonId)))
    throw new TrackContentError("Every canonical lesson needs an approved primary recording; unrelated lesson mappings are not allowed.");
  for (const resource of resources) {
    if (resource.ownerOrganizationId !== track.producerOrganizationId || !resource.licenseCode.trim() ||
      ["unknown", "unverified", "illustrative"].includes(resource.licenseCode.toLowerCase()))
      throw new TrackContentError("Provider-owned resources with declared rights are required.");
    const usedByLearner = lessons.some(l => [l.resourceId, l.captionResourceId, l.transcriptResourceId].includes(resource.id)) ||
      activities.some(a => a.resourceId === resource.id);
    if (usedByLearner && (resource.id === version.rightsEvidenceResourceId || resource.metadata.audience !== "student"))
      throw new TrackContentError("Only explicitly student-facing resources may be placed in learner content.");
    if (resource.url) {
      const url = new URL(resource.url);
      if (url.protocol !== "https:" || url.username || url.password || url.port) throw new TrackContentError("Safe HTTPS resource required.");
    }
    if (resource.documentId) {
      const doc = docs.find(d => d.id === resource.documentId);
      if (!doc || !doc.verifiedAt || !doc.verifiedByPersonId || doc.verifiedByPersonId === version.createdByPersonId ||
        doc.verifiedByPersonId === track.presenterPersonId || (doc.expiresAt && doc.expiresAt <= now))
        throw new TrackContentError("Current independently verified private document required.");
      if (usedByLearner && (doc.subjectType !== "organization" || doc.subjectId !== track.producerOrganizationId ||
        !["instructional_track_media", "instructional_track_resource"].includes(doc.category) ||
        doc.storageProvider !== "cloudflare_r2" || !trackPrivateKeyPattern.test(doc.storageKey) ||
        doc.storageKey.split("/")[2] !== track.producerOrganizationId ||
        !["video/mp4", "video/webm", "text/vtt", "text/plain", "application/pdf"].includes(doc.mimeType ?? "")))
        throw new TrackContentError("Private learner resources require a verified, bounded central track asset.");
    }
  }
  const rightsResource = resources.find(r => r.id === version.rightsEvidenceResourceId);
  const rights = docs.find(d => d.id === rightsResource?.documentId);
  if (!draft && (!rights || rights.subjectType !== "course_template_version" || rights.subjectId !== course.id ||
    rights.category !== "instructional_track_rights" || rights.metadata.producerOrganizationId !== track.producerOrganizationId ||
    rights.metadata.presenterPersonId !== track.presenterPersonId || !rights.expiresAt || !version.rightsExpiresAt ||
    version.rightsExpiresAt <= now || version.rightsExpiresAt > rights.expiresAt))
    throw new TrackContentError("Course- and presenter-specific recording rights with a valid expiry are required.");
  for (const lesson of lessons) {
    const resource = resources.find(r => r.id === lesson.resourceId);
    if (!resource || resource.kind !== "video" || (!draft && !lesson.captionResourceId && !lesson.transcriptResourceId))
      throw new TrackContentError("Every recording needs video media and captions or an accessible transcript.");
    if (resource.url && !resolveClassVideo(resource.url, true)) throw new TrackContentError("Supported video URL required.");
    if (resource.documentId) {
      const doc = docs.find(d => d.id === resource.documentId)!;
      if (doc.storageProvider !== "cloudflare_r2" || !["video/mp4", "video/webm"].includes(doc.mimeType ?? "") ||
        doc.category !== "instructional_track_media" || doc.subjectType !== "organization" || doc.subjectId !== track.producerOrganizationId ||
        !trackPrivateKeyPattern.test(doc.storageKey) || doc.storageKey.split("/")[2] !== track.producerOrganizationId ||
        doc.metadata.fileSignatureVerified !== true)
        throw new TrackContentError("Verified centrally owned track media required; Section uploads cannot become master recordings.");
    }
  }
  for (const activity of activities) if (activity.body) parseStudentPracticeBody(activity.body);
  for (const secret of secrets) {
    const activity = activities.find(a => a.id === secret.activityId);
    const solutions = trackSolutionSchema.parse(secret.solutions);
    const promptKeys = activity?.body?.prompts.map(p => p.key) ?? [];
    if (solutions.some(s => !promptKeys.includes(s.promptKey)) || new Set(solutions.map(s => s.promptKey)).size !== solutions.length)
      throw new TrackContentError("Private solutions must refer to distinct prompts in the reviewed activity.");
  }
  return lessonIds;
}

export async function assertTrackDeliverable(tx: TrackTx, bundle: TrackBundle, context: {
  providerOrganizationId: string; courseVersionId: string; selectionCreatedAt: Date | null; programId: string;
}) {
  if (bundle.track.producerOrganizationId !== context.providerOrganizationId || bundle.course.id !== context.courseVersionId ||
    bundle.version.manifestHash !== bundle.computedManifestHash || !trackContentAvailable({ status: bundle.version.status,
      rightsExpiresAt: bundle.version.rightsExpiresAt, selectionCreatedAt: context.selectionCreatedAt, restrictions: bundle.restrictions, now: new Date() }))
    throw new AuthorizationError("current approved instructional track for this Program's exact course release");
  await requireCurrentTrackPresenter(tx, { personId: bundle.track.presenterPersonId, providerId: context.providerOrganizationId,
    courseVersionId: context.courseVersionId, programId: context.programId });
  try { await assertTrackContentReady(tx, bundle); }
  catch (error) { if (error instanceof TrackContentError) throw new AuthorizationError("current rights-cleared track assets"); throw error; }
}
