import {createServerFn} from "@tanstack/react-start";
import {getRequest, setResponseHeader} from "@tanstack/react-start/server";
import {AuthorizationError} from "@/domain/command-context";
import {readWorkspaceSession} from "@/modules/identity/workspace-session.server";
import {
  PARTICIPATION_READ_MODEL_VERSION, assertParticipationReadModel,
  type ParticipationReadModel, type ParticipationRecord,
  type ParticipationSource, type ActivitySource, type ParticipationOpportunity,
} from "@/domain/participation-read-model";
import {
  assembleParticipation, projectSchoolSections, projectNativeClasses,
  projectSchoolPrograms, projectAcceptedCalendarEvents,
  projectNoncreditCourses, projectFamilyEnrichment, projectNoncreditOpportunities,
} from "@/domain/participation-projections";
import {getCourseRegistration} from "@/modules/learning/course-registration.functions";
import {getMyNativeClassEnrollmentHistoryPage} from "@/modules/classes/native-class-enrollment.functions";
import {readBoundedNativeClassHistory} from "@/domain/native-class-history-pagination";
import {getMyNoncreditSelfEnrollments} from "@/modules/enrollment/noncredit-self-enrollment.functions";
import {getMyNoncreditWaitlist} from "@/modules/enrollment/noncredit-waitlist.functions";
import {getMyProgramEventParticipation} from "./personal-program-event.functions";
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
    const opportunities: ParticipationOpportunity[] = [];
    const sources: ParticipationReadModel["sources"] = [];
    const work: Array<Promise<void>> = [];
    const enabled = new Set<ActivitySource>();
    function register(
      source: ParticipationSource,
      reader: () => Promise<
        ParticipationRecord[] | {items: ParticipationRecord[]; message: string | null}
      >,
    ): void {
      enabled.add(source);
      work.push((async () => {
        try {
          const permitted = await reader();
          const items = Array.isArray(permitted) ? permitted : permitted.items;
          const message = Array.isArray(permitted) ? null : permitted.message;
          records.push(...items);
          sources.push({source, state: "ready", coverage: "partial", message});
        } catch {
          // Never leak which records exist, or an internal auth/database error.
          sources.push({
            source, state: "unavailable", coverage: "unknown",
            message: "This source could not be verified with the current access.",
          });
        }
      })());
    }
    function registerOpportunities(
      source: "noncredit_waitlist",
      reader: () => Promise<ParticipationOpportunity[]>,
    ): void {
      enabled.add(source);
      work.push((async () => {
        try {
          opportunities.push(...await reader());
          sources.push({source, state: "ready", coverage: "partial", message: null});
        } catch {
          sources.push({source, state: "unavailable", coverage: "unknown",
            message: "This source could not be verified with the current access."});
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
    if(["student","guardian","account_holder"].includes(session.role)){
      // Each accepted Event belongs to this verified Person. Academic Program
      // enrollment remains bounded to verified student/guardian relationships.
      const programEvents=getMyProgramEventParticipation();
      if(session.role==="student"||session.role==="guardian")
        register("school_program",async()=>
          projectSchoolPrograms((await programEvents).programs,now));
      register("calendar_event",async()=>
        projectAcceptedCalendarEvents((await programEvents).events,now));
    }
    // Personal adult training is bound to the verified access account; it does
    // not inherit permissions from Site staff roles or a dependent's record.
    if (session.role === "guardian" || session.role === "account_holder") {
      register("noncredit_course", async () =>
        projectNoncreditCourses(await getMyNoncreditSelfEnrollments(), now));
      registerOpportunities("noncredit_waitlist", async () =>
        projectNoncreditOpportunities(await getMyNoncreditWaitlist()));
    }
    // Native Class participation still requires the verified canonical learner
    // grant. A student or guardian display role never substitutes for it.
    if (["account_holder", "student", "guardian"].includes(session.role)) {
      register("native_class", async () => {
        // Reuse WS2's authoritative, Person-scoped Class history pagination.
        // This is a bounded display projection, never a second Enrollment
        // authority. Keeping coverage explicitly "partial" also avoids
        // promising complete lifetime history from an unbounded query.
        const {items, hasMore} = await readBoundedNativeClassHistory(
          cursor => getMyNativeClassEnrollmentHistoryPage({data: {cursor}}),
          10,
        );
        return {
          items: projectNativeClasses(items, now, session.sites),
          message: hasMore
            ? "Additional native Class history exists beyond the 500-record Activity limit. Use the Classes history view to access older records."
            : null,
        };
      });
    }
    await Promise.all(work);
    const allSources: ActivitySource[] = [
      "school_section", "school_program", "calendar_event",
      "native_class", "noncredit_course",
      "family_enrichment", "noncredit_waitlist",
    ];
    for (const source of allSources) {
      if (!enabled.has(source)) sources.push({
        source, state: "not_applicable", coverage: "not_applicable", message: null,
      });
    }
    sources.sort((a, b) => allSources.indexOf(a.source) - allSources.indexOf(b.source));
    const projection: ParticipationReadModel = {
      version: PARTICIPATION_READ_MODEL_VERSION,
      generatedAt: now.toISOString(),
      viewerRole: session.role,
      activeGrantId: session.activeGrantId,
      records: assembleParticipation(records),
      opportunities,
      sources,
    };
    assertParticipationReadModel(projection);
    return projection;
  },
);
