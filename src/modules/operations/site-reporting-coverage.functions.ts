import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { domainEvents, programs, sites } from "@/db/schema";
import { assertWholeSiteReportingScope } from "@/domain/site-setup-scope";
import { REPORTABLE_EVENT_CATALOG } from "@/domain/reportable-event-catalog";
import { projectAuthorizedSourceEvents } from "@/domain/reporting-source-projection";
import { getCommandContext } from "@/modules/identity/command-context.server";

/**
 * Internal Site-scoped source quality report. NOT the legacy school insights
 * action module, a public impact report, or an aggregated participation metric.
 * Uses the canonical outbox and exact current registrar/Site authorization.
 * Exposes no raw source IDs or private source payloads to the client.
 */
const params = z.object({
  siteId: z.string().uuid(),
  from: z.string().datetime({ offset: true }),
  to: z.string().datetime({ offset: true }),
}).strict();

const MAX_SOURCE_EVENTS = 2_000;
const MAX_PERIOD_MS = 90 * 86_400_000;

export const getSiteReportingSourceCoverage = createServerFn({ method: "GET" })
  .validator((value: unknown) => params.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    const from = new Date(data.from), to = new Date(data.to), asOf = new Date();
    if (to <= from || to > asOf || to.getTime() - from.getTime() > MAX_PERIOD_MS) {
      throw new Error("Source coverage requires a closed, positive UTC window up to 90 days");
    }
    return db.transaction(async tx => {
      const [site] = await tx.select({
        id: sites.id, organizationId: sites.organizationId,
      }).from(sites).where(eq(sites.id, data.siteId)).limit(1);
      // Explicitly prove that a partial Site grant cannot indirectly
      // aggregate data belonging to ungranted sibling Programs.
      const attached = site
        ? await tx.select({ id: programs.id }).from(programs)
          .where(and(eq(programs.siteId, site.id), eq(programs.organizationId, site.organizationId)))
        : [];
      assertWholeSiteReportingScope(actor, site, attached.map(row => row.id));
      const registered = Object.keys(REPORTABLE_EVENT_CATALOG);
      // Query predicates restrict the current operator first. Projection
      // repeats the scope check and verifies all source attribution.
      const rows = await tx.select({
        id: domainEvents.id, eventType: domainEvents.eventType,
        aggregateType: domainEvents.aggregateType,
        aggregateId: domainEvents.aggregateId,
        occurredAt: domainEvents.occurredAt,
        payload: domainEvents.payload,
      }).from(domainEvents).where(and(
        inArray(domainEvents.eventType, registered),
        gte(domainEvents.occurredAt, from),
        lt(domainEvents.occurredAt, to),
        sql`${domainEvents.payload}->>'organizationId' = ${site.organizationId}`,
        sql`${domainEvents.payload}->>'siteId' = ${site.id}`,
      )).orderBy(asc(domainEvents.occurredAt), asc(domainEvents.id))
        .limit(MAX_SOURCE_EVENTS + 1);
      if (rows.length > MAX_SOURCE_EVENTS) {
        throw new Error("Source coverage exceeded the bounded interactive query; use partitioning");
      }
      const projected = projectAuthorizedSourceEvents(rows, {
        verifiedOrganizationIds: new Set([site.organizationId]),
        verifiedSiteIds: new Set([site.id]),
      }, {
        from: from.toISOString(), to: to.toISOString(), asOf: asOf.toISOString(),
      });
      return {
        siteId: site.id, from: from.toISOString(), to: to.toISOString(),
        asOf: asOf.toISOString(),
        observedEvents: projected.events.length,
        observedCounts: projected.observedCounts,
        sourceCoverage: projected.coverage,
        /** Source event coverage is not verification of Program outcomes. */
        outcomeMetricsAvailable: false as const,
      };
    });
  });
