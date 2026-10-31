import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { readPublishedSiteCatalog } from "./site-public-catalog.server";

/**
 * Only explicit, site-published academic and enrichment catalog data can be
 * returned. Site and Program approvals are separate from admissions readiness.
 * Public tenant routing remains disabled unless independently configured.
 */
export const getPublishedSiteCatalog = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({
    slug: z.string().min(1).max(100),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readPublishedSiteCatalog(data.slug);
  });
