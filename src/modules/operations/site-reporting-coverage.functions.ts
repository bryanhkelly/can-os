import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { readSiteReportingSourceCoverage } from "@/modules/insights/site-reporting-source-query.server";

/** Thin private API boundary. All projections, SQL and authorization are reused. */
const params = z.object({
  siteId: z.string().uuid(),
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
}).strict();

export const getSiteReportingSourceCoverage = createServerFn({ method:"GET" })
  .validator((value:unknown) => params.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    return readSiteReportingSourceCoverage(actor, data);
  });
