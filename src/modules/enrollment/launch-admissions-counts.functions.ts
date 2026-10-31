import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { applications, programs } from "@/db/schema";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { operationsSelectionSchema, resolveOperationsSelection } from "@/modules/operations/operations-scope.server";

/** Counts the full authorized admissions scope, never a paginated intake list. */
export const getLaunchAdmissionsCounts = createServerFn({ method: "GET" })
  .validator((value: unknown) => operationsSelectionSchema.parse(value ?? {}))
  .handler(async ({ data }) => {
    const actor = await getCommandContext(getRequest());
    setResponseHeader("Cache-Control", "private, no-store");
    if (actor.role !== "registrar" || !actor.actorPersonId || !actor.scope.organizationIds?.length) {
      throw new AuthorizationError("launch admissions totals");
    }
    assertCapability(actor, "enrollment.decide");
    const scoped = await resolveOperationsSelection(actor, data);
    if (!scoped.programIds.length || !process.env.DATABASE_URL) {
      return { total: 0, accepted: 0, awaiting: 0 };
    }
    const [row] = await db.select({
      total: count(),
      accepted: sql<number>`cast(sum(case when ${applications.stage} = 'accepted' then 1 else 0 end) as integer)`,
      awaiting: sql<number>`cast(sum(case when ${applications.stage} in ('inquiry','application','eligibility') then 1 else 0 end) as integer)`,
    }).from(applications)
      .innerJoin(programs, eq(programs.id, applications.programId))
      .where(and(inArray(applications.programId, scoped.programIds),
        data.siteId ? eq(programs.siteId, data.siteId) : undefined,
        data.programId ? eq(applications.programId, data.programId) : undefined));
    return { total: row?.total ?? 0, accepted: row?.accepted ?? 0, awaiting: row?.awaiting ?? 0 };
  });
