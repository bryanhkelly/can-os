import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assertCapability, AuthorizationError } from "@/domain/command-context";
import { assertSyntheticMutation } from "@/modules/_demo/demo-write-gate";
import { startProgramLaunch, activateProgram } from "./program-launch-service";
import { completeJourneyRequirement } from "@/modules/journeys/complete-requirement";

const programTypes = [
  "church_hosted_academy",
  "high_school_extension",
  "full_school",
  "microschool",
  "hybrid_program",
  "homeschool_cohort",
  "summer_enrichment",
] as const;

const uuid = z.string().uuid();

const startLaunchInput = z.object({
  name: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase kebab-case"),
  type: z.enum(programTypes),
  gradeRange: z.object({
    min: z.string().trim().min(1).max(10),
    max: z.string().trim().min(1).max(10),
  }),
  deliveryModel: z
    .object({
      onsite: z.boolean().optional(),
      asynchronous: z.boolean().optional(),
      liveOnline: z.boolean().optional(),
      onsiteDaysPerWeek: z.number().int().min(1).max(7).optional(),
    })
    .refine(
      (model) => !!(model.onsite || model.asynchronous || model.liveOnline),
      "Select at least one delivery model",
    ),
  hostOrganizationId: uuid,
  jurisdictionId: uuid,
  academicProviderOrganizationId: uuid,
  creditIssuingOrganizationId: uuid,
  siteId: uuid.optional(),
});

async function registrarContext(capability: string) {
  const context = await getCommandContext(getRequest());
  assertCapability(context, capability);
  if (context.role !== "registrar") {
    throw new AuthorizationError("registrar program launch workspace");
  }
  return context;
}

/** Wizard dropdown options, scoped to the registrar's verified organization grant. */
export const listLaunchOptions = createServerFn({ method: "GET" }).handler(
  async () => {
    const context = await registrarContext("program.read");
    const organizationIds = context.scope.organizationIds ?? [];
    if (!organizationIds.length) {
      return { organizations: [], sites: [], jurisdictions: [] };
    }
    const [{ db }, s, { asc, inArray }] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const [organizationRows, siteRows, jurisdictionRows] = await Promise.all([
      db
        .select({ id: s.organizations.id, name: s.organizations.name, type: s.organizations.type })
        .from(s.organizations)
        .where(inArray(s.organizations.id, organizationIds))
        .orderBy(asc(s.organizations.name)),
      db
        .select({
          id: s.sites.id,
          organizationId: s.sites.organizationId,
          name: s.sites.name,
          timezone: s.sites.timezone,
        })
        .from(s.sites)
        .where(inArray(s.sites.organizationId, organizationIds))
        .orderBy(asc(s.sites.name)),
      db
        .select({ id: s.jurisdictions.id, code: s.jurisdictions.code, name: s.jurisdictions.name })
        .from(s.jurisdictions)
        .orderBy(asc(s.jurisdictions.name)),
    ]);
    return {
      organizations: organizationRows,
      sites: siteRows,
      jurisdictions: jurisdictionRows,
    };
  },
);

/** Start a GF3 host/program launch: creates the Program and instantiates its Launch Journey. */
export const startLaunch = createServerFn({ method: "POST" })
  .validator((data: unknown) => startLaunchInput.parse(data))
  .handler(async ({ data }) => {
    assertSyntheticMutation("registrar");
    const context = await registrarContext("program.launch.start");
    if (!context.scope.organizationIds?.includes(data.hostOrganizationId)) {
      throw new AuthorizationError("host organization scope");
    }
    if (data.siteId && !context.scope.siteIds?.includes(data.siteId)) {
      throw new AuthorizationError("site scope");
    }
    return startProgramLaunch(context, data);
  });

/** Programs in pre-active states with their Launch Journey and requirement checklist. */
export const listLaunches = createServerFn({ method: "GET" }).handler(
  async () => {
    const context = await registrarContext("program.read");
    const organizationIds = context.scope.organizationIds ?? [];
    if (!organizationIds.length) return { launches: [] };
    const [{ db }, s, { and, asc, eq, inArray }] = await Promise.all([
      import("@/db/client"),
      import("@/db/schema"),
      import("drizzle-orm"),
    ]);
    const programRows = await db
      .select({
        id: s.programs.id,
        name: s.programs.name,
        slug: s.programs.slug,
        type: s.programs.type,
        status: s.programs.status,
        organizationId: s.programs.organizationId,
        siteId: s.programs.siteId,
        createdAt: s.programs.createdAt,
      })
      .from(s.programs)
      .where(
        and(
          inArray(s.programs.organizationId, organizationIds),
          inArray(s.programs.status, ["draft", "launching", "ready"]),
        ),
      )
      .orderBy(asc(s.programs.createdAt));
    const launches = await Promise.all(
      programRows.map(async (program) => {
        const [journey] = await db
          .select({ id: s.journeys.id, status: s.journeys.status })
          .from(s.journeys)
          .where(
            and(
              eq(s.journeys.participantType, "program"),
              eq(s.journeys.participantId, program.id),
            ),
          )
          .limit(1);
        const requirements = journey
          ? await db
              .select({
                id: s.journeyRequirements.id,
                key: s.journeyRequirements.key,
                title: s.journeyRequirements.title,
                status: s.journeyRequirements.status,
                blocking: s.journeyRequirements.blocking,
              })
              .from(s.journeyRequirements)
              .where(eq(s.journeyRequirements.journeyId, journey.id))
              .orderBy(asc(s.journeyRequirements.createdAt))
          : [];
        return {
          ...program,
          createdAt: program.createdAt.toISOString(),
          journey: journey ?? null,
          requirements,
        };
      }),
    );
    return { launches };
  },
);

/**
 * Complete one launch requirement. The registrar role holds the centralized
 * "journey.requirement.complete" capability; the shared journeys module performs
 * the status transition, ready-flip, and audit/domain events in one transaction.
 */
export const completeLaunchRequirement = createServerFn({ method: "POST" })
  .validator((data: unknown) =>
    z.object({ journeyRequirementId: uuid }).parse(data),
  )
  .handler(async ({ data }) => {
    assertSyntheticMutation("registrar");
    const context = await registrarContext("journey.requirement.complete");
    const journeyStatus = await completeJourneyRequirement(
      context,
      data.journeyRequirementId,
    );
    return { journeyRequirementId: data.journeyRequirementId, journeyStatus };
  });

/** Activate a launched program; program-launch-service enforces the Launch Journey ready invariant. */
export const activateLaunch = createServerFn({ method: "POST" })
  .validator((data: unknown) => z.object({ programId: uuid }).parse(data))
  .handler(async ({ data }) => {
    assertSyntheticMutation("registrar");
    const context = await registrarContext("program.activate");
    await activateProgram(context, data.programId);
    return { programId: data.programId, status: "active" as const };
  });
