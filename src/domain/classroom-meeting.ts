import { z } from "zod";

export const classroomMeetingUrl = z.string().url().max(2048).refine(value => {
  const url = new URL(value);
  return url.protocol === "https:" && !url.username && !url.password;
}, "Use an HTTPS meeting link without embedded credentials.");

export function readClassroomMeetingUrl(metadata: Record<string, unknown>): string | null {
  if (metadata.classroomMeetingUrl === undefined || metadata.classroomMeetingUrl === null) return null;
  return classroomMeetingUrl.parse(metadata.classroomMeetingUrl);
}
