import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { readPublishedSiteCatalog } from "./site-public-catalog.server";

/**
 * Only explicit, site-published catalog data can be returned. There is no
 * public page, Host routing, or publish transition in this increment.
 */
export const getPublishedSiteCatalog = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({
    slug: z.string().min(1).max(100),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "no-store");
    return readPublishedSiteCatalog(data.slug);
  });
