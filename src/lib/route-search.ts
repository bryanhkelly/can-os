import { encodeUuidForPath, decodeUuidPathParam } from "@/domain/opaque-url-id";
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

/** Encode only real UUID selection identifiers. Non-UUID test and historical
 * values retain their pre-existing URL encoding and validation behavior. */
function encodeOptionalReference(value: string): string {
  const canonical = decodeUuidPathParam(value);
  return canonical ? encodeUuidForPath(canonical) : value;
}

export function siteProgramHref(path: string, selection: { siteId?: string; programId?: string }): string {
  const search = new URLSearchParams();
  if (selection.siteId) search.set("siteId", encodeOptionalReference(selection.siteId));
  if (selection.programId) search.set("programId", encodeOptionalReference(selection.programId));
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
