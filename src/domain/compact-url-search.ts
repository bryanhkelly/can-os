import { decodeUuidPathParam, encodeUuidForPath } from "./opaque-url-id";

/**
 * Only URI identity selectors, never share tokens, authentication codes,
 * external callback payloads or free-text search terms.
 *
 * TanStack's search parser/serializer calls this on top-level search records.
 * Domain commands still receive the exact canonical UUIDs.
 */
const uuidSelectors = new Set([
  "siteId", "programId", "organizationId", "personId", "studentId", "studentProfileId",
  "classId", "sectionId", "assessmentId", "actionId", "courseId",
  "courseAttemptId", "courseVersionId", "offeringVersionId", "trackVersionId",
  "solutionPlanId", "applicationId", "enrollmentId", "groupId",
  "sessionId", "yearId", "tripId", "eventId", "seasonId", "journeyId",
  "releaseId", "offeringId", "returnGrantId", "grantId", "participantId",
  // Established filters use the same authoritative UUID values.
  "student", "section", "assessment", "action", "session", "event", "enrollment", "release",
  "submission", "case", "gradeAction", "trip", "attendance", "referral", "offer", "thread",
  "notification", "person", "insight",
]);

export function compactUuidSearchSelections<T extends Record<string, unknown>>(search: T): T {
  const result: Record<string, unknown> = { ...search };
  for (const [key, value] of Object.entries(search)) {
    if (!uuidSelectors.has(key) || typeof value !== "string" || value.length !== 36) continue;
    const uuid = decodeUuidPathParam(value);
    if (uuid) result[key] = encodeUuidForPath(uuid);
  }
  return result as T;
}

export function expandUuidSearchSelections<T extends Record<string, unknown>>(search: T): T {
  const result: Record<string, unknown> = { ...search };
  for (const [key, value] of Object.entries(search)) {
    if (!uuidSelectors.has(key) || typeof value !== "string" || value.length !== 22) continue;
    const uuid = decodeUuidPathParam(value);
    if (uuid) result[key] = uuid;
  }
  return result as T;
}
