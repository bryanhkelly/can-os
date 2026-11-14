import { z } from "zod";

export const classroomMeetingUrl = z.string().url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS meeting link without embedded credentials.");

export function readClassroomMeetingUrl(metadata: Record<string, unknown>): string | null {
  if (metadata.classroomMeetingUrl === undefined || metadata.classroomMeetingUrl === null) return null;
  // Older/imported calendar metadata may not satisfy the current policy.
  // Never return an unsafe link or fail the entire class-calendar read.
  const parsed = classroomMeetingUrl.safeParse(metadata.classroomMeetingUrl);
  return parsed.success ? parsed.data : null;
}
