import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { sitePublications, sites } from "@/db/schema";
import { readAcademicProgramCatalog } from "./academic-program-catalog.server";
import { approvedIdentityFacts } from "@/domain/public-parent-identity";
import { projectPublicFamilyServices } from "@/domain/site-family-services";
import { readApprovedPublicSitePeople } from "./site-public-people.server";
import { readApprovedPublicSchoolDay } from "@/modules/academic-time/public-school-day.server";
import { resolvePublishedFamilyStartDestination } from "@/modules/enrollment/public-family-start.server";
import { isDemoTenantOrganization } from "@/modules/identity/demo-school-tenants.server";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import {
  unconfiguredClaim, verifiedPublicClaim,
  type PublicProgramSchoolDay, type PublicProgramWeeklyPeriod,
  type PublicAdmissionsState, type PublicSchoolDay,
} from "@/domain/parent-information";

type Reader = Pick<typeof db, "select">;
type DetailedSchedule = Awaited<ReturnType<typeof readApprovedPublicSchoolDay>> & {
  weeklyPatternState?: "pending" | "approved";
  weeklyPattern?: PublicProgramWeeklyPeriod[];
  programScope?: {
    siteId: string; programId: string; gradeRange: {min:string;max:string};
  } | null;
  approvalRevision?: number | null;
  effectiveFrom?: string | null;
  effectiveThrough?: string | null;
};
const isDay = (v:number) => Number.isInteger(v) && v >= 0 && v <= 6;
const isTime = (v:string) => /^([01]\\d|2[0-3]):[0-5]\\d$/.test(v);
const isDate = (v:string) => /^\\d{4}-\\d{2}-\\d{2}$/.test(v);

/** The C reader is the authority: exact schedule signature, current academic
 * year, Site/Program scope, reviewer and timezone are validated there.
 * This conversion merely provides a backwards-compatible public shape.
 * It also supports the legacy uniformly approved reader on main until I
 * merges C's varied-day weeklyPattern contract. */
function toProgramSchoolDay(
  program: {programId:string;title:string;grades:{min:string;max:string}},
  projection: DetailedSchedule,
  siteId: string,
): PublicProgramSchoolDay | null {
  const scope = projection.programScope;
  if (scope && (scope.siteId !== siteId || scope.programId !== program.programId ||
    scope.gradeRange.min !== program.grades.min ||
    scope.gradeRange.max !== program.grades.max)) return null;

  const timezone = projection.timezone;
  if (!timezone) return null;
  try { new Intl.DateTimeFormat("en-US", {timeZone:timezone}); }
  catch { return null; }

  let pattern: PublicProgramWeeklyPeriod[] = [];
  if (projection.weeklyPatternState === "approved" && projection.weeklyPattern) {
    pattern = projection.weeklyPattern;
  } else if (projection.state === "approved" && projection.days.canDisplay &&
    projection.startTime.canDisplay && projection.endTime.canDisplay) {
    const days = projection.days.value ?? [];
    const start = projection.startTime.value;
    const end = projection.endTime.value;
    if (start && end) pattern = days.map(dayOfWeek => ({
      dayOfWeek, startsAtLocal:start, endsAtLocal:end, timezone,
    }));
  }
  if (!pattern.length || pattern.length > 7 ||
    new Set(pattern.map(item=>item.dayOfWeek)).size !== pattern.length ||
    pattern.some(item=>!isDay(item.dayOfWeek) || !isTime(item.startsAtLocal) ||
      !isTime(item.endsAtLocal) || item.startsAtLocal >= item.endsAtLocal ||
      item.timezone !== timezone)) return null;

  const revision = projection.approvalRevision ??
    (projection.days.canDisplay ? projection.days.revision : null);
  const from = projection.effectiveFrom;
  const through = projection.effectiveThrough;
  return {
    programId:program.programId,
    name:verifiedPublicClaim(program.title,"program_publication"),
    grades:verifiedPublicClaim(program.grades,"program_publication"),
    timezone:verifiedPublicClaim(timezone,"calendar",revision),
    effectiveFrom:from && isDate(from)
      ? verifiedPublicClaim(from,"calendar",revision)
      : unconfiguredClaim("calendar"),
    effectiveThrough:through && isDate(through)
      ? verifiedPublicClaim(through,"calendar",revision)
      : unconfiguredClaim("calendar"),
    weeklyPattern:verifiedPublicClaim(
      [...pattern].sort((a,b)=>a.dayOfWeek-b.dayOfWeek),
      "calendar",revision),
  };
}

/** Only expected admission-gate rejections may be turned into "not open".
 * Unexpected infrastructure failures must not be disguised as a legal result. */
function expectedIntakeRejection(error:unknown):boolean {
  if (error instanceof AuthorizationError || error instanceof DomainError) return true;
  return error instanceof Error && [
    "School applications not open",
    "School application details require renewed approval",
    "School has no active configured application year",
  ].includes(error.message);
}

/**
 * This receives published Program IDs from the canonical academic catalog.
 * It never accepts arbitrary unpublished Program IDs or Site draft fields as
 * authority. Only independent, same-request source checks grant each claim.
 * All queries share the caller's transaction when provided.
 */
export async function readApprovedPublicParentExtras(
  siteId: string,
  academicProgramIds: readonly string[],
  _siteMetadata: Record<string, unknown> | null,
  executor: Reader = db,
) {
  // Lock and re-read current source revisions; do not use stale preview metadata.
  const [record] = await executor.select({
    address:sites.address,metadata:sites.metadata,
  }).from(sites).where(eq(sites.id,siteId))
    .for("share",{of:sites}).limit(1);
  const metadata=record?.metadata??null;
  const identity=approvedIdentityFacts(siteId,record?.address??null,metadata);
  const allowed = new Set(academicProgramIds);
  const programs = (await readAcademicProgramCatalog(siteId, executor))
    .filter(program=>allowed.has(program.programId));
  const programSchedules: PublicProgramSchoolDay[] = [];
  let legacySchoolDay: PublicSchoolDay | undefined;

  for (const program of programs) {
    const day = await readApprovedPublicSchoolDay(
      siteId, program.programId, executor) as DetailedSchedule;
    const schedule = toProgramSchoolDay(program, day, siteId);
    if (schedule) programSchedules.push(schedule);
    if (programs.length === 1 && day.state === "approved") {
      // Legacy Site-wide field is populated only for one unambiguous Program.
      legacySchoolDay = day;
    }
  }

  const [published] = await executor.select({
    slug:sitePublications.slug, organizationId:sites.organizationId,
  }).from(sitePublications)
    .innerJoin(sites,eq(sites.id,sitePublications.siteId))
    .where(and(eq(sites.id,siteId),
      eq(sitePublications.status,"published"),
      isNotNull(sitePublications.publishedAt)))
    .for("share",{of:sitePublications}).limit(1);

  const people = published
    ? await readApprovedPublicSitePeople(siteId,executor) : [];

  let admissions: PublicAdmissionsState = {
    applicationOpen:false, description:unconfiguredClaim("admissions"),
    programs:programs.map(program=>({
      programId:program.programId, status:"information_only" as const,
      description:unconfiguredClaim<string>("admissions"),
    })),
  };
  if (published) {
    const demo = metadata?.synthetic === true ||
      await isDemoTenantOrganization(published.organizationId,executor);
    const states: NonNullable<PublicAdmissionsState["programs"]> = [];
    for (const program of programs) {
      let eligible = false;
      if (!demo) {
        try {
          await resolvePublishedFamilyStartDestination(
            executor, program.programId, published.slug);
          eligible = true;
        } catch (error) {
          if (!expectedIntakeRejection(error)) throw error;
        }
      }
      states.push({
        programId:program.programId,
        status:eligible ? "verified_application" : "information_only",
        description:eligible
          ? verifiedPublicClaim(
            "Applications can begin after adult email verification. Admission and enrollment are subject to school review.",
            "admissions")
          : unconfiguredClaim("admissions"),
      });
    }
    const anyOpen = states.some(item=>item.status === "verified_application");
    admissions = {
      applicationOpen:anyOpen,
      description:anyOpen
        ? verifiedPublicClaim(
          "At least one academic Program is accepting verified application starts. Check each Program for availability.",
          "admissions")
        : unconfiguredClaim("admissions"),
      programs:states,
    };
  }
  return {
    schoolDay:legacySchoolDay,
    programSchedules,
    people,
    admissions,
    services:projectPublicFamilyServices(metadata),
    ...identity,
    // S's physical Site address and setupContact are church-supplied drafts.
    // They are NOT public claims until I supplies signed, current independent
    // review records and a canonical publisher; never surface either here.
  };
}
