import { z } from "zod";

/**
 * Church-managed Site setup inputs. These are operational draft facts, never
 * proof of jurisdiction applicability or authority to publish a parent claim.
 * Shared by launch creation and revisioned Site configuration edits.
 */
export const physicalSiteAddressSchema = z.object({
  street1: z.string().trim().min(2).max(200),
  street2: z.string().trim().max(200).optional(),
  city: z.string().trim().min(2).max(120),
  state: z.string().trim().min(2).max(80),
  postalCode: z.string().trim().min(3).max(24),
  country: z.string().trim().min(2).max(80).default("US"),
  county: z.string().trim().max(120).optional(),
}).strict();

export const draftSiteContactSchema = z.object({
  displayName: z.string().trim().min(2).max(160),
  email: z.union([z.string().trim().email().max(254),z.literal("")]),
  phone: z.string().trim().max(40),
  website: z.union([z.string().trim().url().max(500),z.literal("")]),
}).strict();

/** The selected IANA time zone is authoritative; never derive it from a state or a browser. */
export const siteTimezoneSchema = z.string().trim().min(3).max(80).refine(zone=>{
  try { new Intl.DateTimeFormat("en-US",{timeZone:zone}); return true; }
  catch { return false; }
},"Choose a valid school time zone");

export type PhysicalSiteAddress = z.infer<typeof physicalSiteAddressSchema>;
export type DraftSiteContact = z.infer<typeof draftSiteContactSchema>;

/** Empty location is permitted for initial setup; partially entered is not. */
export function hasEnteredSiteAddress(address:Record<string,string>):boolean {
  return Object.entries(address).some(([key,value])=>
    key!=="country" && value.trim().length>0);
}

/** Require a monotonically advancing Site revision even for fast consecutive edits. */
export function nextSiteConfigurationRevision(previous:Date, now=new Date()):Date {
  return new Date(Math.max(now.getTime(), previous.getTime()+1));
}
