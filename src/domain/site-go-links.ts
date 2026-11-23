import { z } from "zod";
import { getJourneyById } from "@/domain/engagement-context";

/** Short links are public navigation references, never authorization tokens. */
export const goCodeSchema = z.string().regex(/^[A-Za-z0-9_-]{12}$/);
const uuid = z.string().uuid();
export const goPageIds = ["home", "programs", "experiences", "courses", "classes", "academics", "admissions", "contact"] as const;

export const goDestinationSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("site-page"), page: z.enum(goPageIds) }).strict(),
  z.object({ kind: z.literal("adult-training"), releaseId: uuid }).strict(),
  z.object({ kind: z.literal("class"), classId: uuid }).strict(),
  z.object({ kind: z.literal("enrichment"), seasonId: uuid }).strict(),
  z.object({ kind: z.literal("information"), journeyId: z.string().regex(/^[a-z][a-z0-9-]{1,60}$/) }).strict(),
]);
export type GoDestination = z.infer<typeof goDestinationSchema>;

export function goDestinationHref(
  value: unknown, code: string, publishedSiteHost: string | null = null,
): string | null {
  const destination = goDestinationSchema.safeParse(value);
  if (!destination.success || !goCodeSchema.safeParse(code).success) return null;
  switch (destination.data.kind) {
    case "site-page": {
      if (!publishedSiteHost || !/^[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(publishedSiteHost)) return null;
      const path = destination.data.page === "home" ? "/" : "/" + destination.data.page;
      return "https://" + publishedSiteHost + path;
    }
    case "adult-training":
      return "/learn/enroll?release=" + encodeURIComponent(destination.data.releaseId) + "&ref=" + encodeURIComponent(code);
    case "class":
      return "/class?classId=" + encodeURIComponent(destination.data.classId);
    case "enrichment":
      return "/enrichment/" + encodeURIComponent(destination.data.seasonId);
    case "information":
      return getJourneyById(destination.data.journeyId)
        ? "/next/" + destination.data.journeyId : null;
  }
}
