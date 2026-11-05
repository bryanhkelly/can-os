import { z } from "zod";

/** URL selections are hints; malformed types are ignored, never coerced. */
export const optionalSearchString = z.string().optional().catch(undefined);
export const optionalSearchUuid = z.string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
  .optional().catch(undefined);

export const siteProgramSelectionSchema = z.object({
  siteId: optionalSearchString,
  programId: optionalSearchString,
});

export function siteProgramHref(path: string, selection: { siteId?: string; programId?: string }): string {
  const search = new URLSearchParams();
  if (selection.siteId) search.set("siteId", selection.siteId);
  if (selection.programId) search.set("programId", selection.programId);
  return path + (search.size ? `?${search.toString()}` : "");
}

export const groupSessionSelectionSchema = z.object({
  group: optionalSearchString,
  session: optionalSearchString,
});

/** Curriculum routes intentionally reject malformed UUIDs instead of ignoring them. */
export const uuidProgramSelectionSchema = z.object({
  programId: z.string().uuid().optional(),
});
