import { createHash } from "node:crypto";

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

function canonical(value: Json): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw new Error("Invalid manifest number.");
    if (value === undefined) throw new Error("Undefined manifest value.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null)
    throw new Error("Manifest must contain JSON values only.");
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key]!)}`).join(",")}}`;
}

/** Build from protected server reads, never a browser-supplied manifest or hash.
 * Include immutable resource snapshots, not just resource IDs: source assets can change.
 * The private hash input is never returned by learner APIs.
 */
export function hashInstructionalTrackManifest(input: {
  courseTemplateVersionId: string;
  presenterPersonId: string;
  producerOrganizationId: string;
  lessons: Json[];
  activities: Json[];
  privateSolutions: Json[];
  resourceSnapshots: Json[];
  rights: Json;
}): string {
  return createHash("sha256").update(canonical({ manifestVersion: 1, ...input })).digest("hex");
}
