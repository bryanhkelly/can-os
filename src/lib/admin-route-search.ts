import { z } from "zod";
import { siteProgramSelectionSchema } from "@/lib/route-search";

/** Shared contract for the administrative console and its dedicated child pages. */
export const adminSearchSchema = siteProgramSelectionSchema.pick({ siteId: true }).extend({
  inviteRole: z.enum(["registrar", "site_website_editor"]).optional().catch(undefined),
});
