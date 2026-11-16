import {createServerFn} from "@tanstack/react-start";
import {getRequest, setResponseHeader} from "@tanstack/react-start/server";
import {AuthorizationError} from "@/domain/command-context";
import {readWorkspaceSession} from "@/modules/identity/workspace-session.server";
import {
  PARTICIPATION_READ_MODEL_VERSION,
  type ParticipationReadModel, type ParticipationRecord,
  type ParticipationSource,
} from "@/domain/participation-read-model";
import {
  assembleParticipation, projectSchoolSections, projectNativeClasses,
  projectNoncreditCourses, projectFamilyEnrichment, projectNoncreditWaitlists,
} from "@/domain/participation-projections";
import {getCourseRegistration} from "@/modules/learning/course-registration.functions";
import {getMyNativeClassEnrollments} from "@/modules/classes/native-class-enrollment.functions";
import {getMyNoncreditSelfEnrollments} from "@/modules/enrollment/noncredit-self-enrollment.functions";
import {getMyNoncreditWaitlist} from "@/modules/enrollment/noncredit-waitlist.functions";
import {getEnrichmentFamily} from "@/modules/activities/enrichment-family.functions";

/**
 * No new enrollment query, Person linkage or cross-Site visibility rule.
 * Each authoritative reader re-verifies its own session, identity and grants.
 * An unavailable reader must NOT be treated as proof of zero participation.
 */
export const getMyActivity = createServerFn({method: "GET"}).handler(
  async (): Promise<ParticipationReadModel> => {
    setResponseHeader("Cache-Control", "private, no-store");
    setResponseHeader("Referrer-Policy", "no-referrer");
    const session = await readWorkspaceSession(getRequest());
    if (!session.authenticated) throw new AuthorizationError("authenticated CAN account");
    const now = new Date();
    const records: ParticipationRecord[] = [];
    const sources: ParticipationReadModel["sources"] = [];
    const work: Array<Promise<void>> = [];
    const enabled = new Set<ParticipationSource>();
    function register(
      source: ParticipationSource,
      reader: () => Promise<ParticipationRecord[]>,
    ): void {
      enabled.add(source);
      work.push((async () => {
        try {
          const permitted = await reader();
          records.push(...permitted);
          sources.push({source, state: "ready", message: null});
        } catch {
          // Never leak which records exist, or an internal auth/database error.
          sources.push({
            source, state: "unavailable",
            message: "This source could not be verified with the current access.",
          });
        }
      })());
    }
    if (session.role === "student") {
      register("school_section", async () => {
        const result = await getCourseRegistration();
        if (!result.connected || result.viewerRole !== "student")
          throw new AuthorizationError("verified student section read");
        return projectSchoolSections(result.sections, now);
      });
    }
    if (session.role === "guardian") {
      register("family_enrichment", async () => {
        const result = await getEnrichmentFamily();
        return projectFamilyEnrichment(result.registrations, result.children, now);
      });
    }
    // Personal adult training is bound to the verified access account; it does
    // not inherit permissions from Site staff roles or a dependent's record.
    if (session.role === "guardian" || session.role === "account_holder") {
      register("noncredit_course", async () =>
        projectNoncreditCourses(await getMyNoncreditSelfEnrollments(), now));
      register("noncredit_waitlist", async () =>
        projectNoncreditWaitlists(await getMyNoncreditWaitlist(), now));
    }
    // Native Class service requires its own canonical learner grant and active
    // Class feature gate. Do not use a CAN student/guardian role as a substitute.
    if (["account_holder", "student", "guardian"].includes(session.role)) {
      register("native_class", async () =>
        projectNativeClasses(await getMyNativeClassEnrollments(), now, session.sites));
    }
    await Promise.all(work);
    const allSources: ParticipationSource[] = [
      "school_section", "native_class", "noncredit_course",
      "family_enrichment", "noncredit_waitlist",
    ];
    for (const source of allSources) {
      if (!enabled.has(source)) sources.push({
        source, state: "not_applicable", message: null,
      });
    }
    sources.sort((a, b) => allSources.indexOf(a.source) - allSources.indexOf(b.source));
    return {
      version: PARTICIPATION_READ_MODEL_VERSION,
      generatedAt: now.toISOString(),
      viewerRole: session.role,
      activeGrantId: session.activeGrantId,
      records: assembleParticipation(records),
      sources,
    };
  },
);
