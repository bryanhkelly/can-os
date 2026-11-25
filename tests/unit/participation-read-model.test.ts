import {shortUuidHref} from "@/domain/opaque-url-id";
import {describe, expect, it} from "vitest";
import {
  PARTICIPATION_READ_MODEL_VERSION, activityBucket, activityStatus, activityStatusLabel,
  resolveActivityFilters, assertUniqueParticipationKeys, assertParticipationReadModel,
  type ParticipationReadModel,
} from "@/domain/participation-read-model";
import {
  assembleParticipation, projectFamilyEnrichment, projectNativeClasses,
  projectNoncreditCourses, projectNoncreditOpportunities, projectSchoolSections,
  projectSchoolPrograms, projectAcceptedCalendarEvents,
} from "@/domain/participation-projections";

const now = new Date("2026-11-16T19:00:00.000Z");
const uuid = (n: number) => "00000000-0000-4000-8000-" + n.toString().padStart(12, "0");
describe("Participation Read Model v1", () => {
  it("exposes a stable version and never infers an outcome from dates", () => {
    expect(PARTICIPATION_READ_MODEL_VERSION).toBe("1.1.0");
    expect(activityBucket("active", "2026-01-01T00:00:00Z", now)).toBe("current");
    expect(activityBucket("active", "2027-01-01T00:00:00Z", now)).toBe("upcoming");
    expect(activityBucket("withdrawn", "2027-01-01T00:00:00Z", now)).toBe("history");
    expect(activityStatusLabel("completed")).toBe("Completed");
  });
  it("excludes a school catalog Section without an actual enrollment", () => {
    const records = projectSchoolSections([
      {id: uuid(1), title: "Math", code: "MTH", enrollmentId: null, enrollmentStatus: null},
      {id: uuid(2), title: "History", code: "HIS", enrollmentId: uuid(3), enrollmentStatus: "active"},
    ], now);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      key: "school_section:" + uuid(3), sourceId: uuid(3),
      refs: {enrollmentId: uuid(3), sectionId: uuid(2)},
      bucket: "current", outcome: null,
    });
    expect(records[0]?.action?.href).toContain(uuid(2));
  });
  it("does not infer an official result or access from completed enrollment", () => {
    const school = projectSchoolSections([{
      id: uuid(2), title: "Completed History", code: "HIS",
      enrollmentId: uuid(3), enrollmentStatus: "completed",
    }], now)[0];
    const native = projectNativeClasses([{
      classEnrollmentId: uuid(4), classId: uuid(5), title: "Completed AI",
      status: "completed", deliveryMode: "online",
      courseAttemptId: uuid(9), enrolledAt: now, siteId: null,
    }], now)[0];
    expect(school).toMatchObject({status: "completed", bucket: "history", outcome: null, action: null});
    expect(native).toMatchObject({status: "completed", bucket: "history", outcome: null, action: null});
    expect(activityStatus("expired")).toBe("unknown");
    expect(activityStatus("cancelled")).toBe("cancelled");
  });
  it("keeps withdrawn school Sections as history without assigning a grade", () => {
    const records = projectSchoolSections([{
      id: uuid(2), title: "History", code: "HIS",
      enrollmentId: uuid(3), enrollmentStatus: "withdrawn",
    }], now);
    expect(records[0]?.bucket).toBe("history");
    expect(records[0]?.outcome).toBeNull();
  });
  it("keeps multi-Site Class identity distinct and only labels verified site choices", () => {
    const base = {
      title: "Digital skills", status: "active", deliveryMode: "facilitated",
      courseAttemptId: uuid(9), enrolledAt: now,
    };
    const records = projectNativeClasses([
      {...base, classEnrollmentId: uuid(4), classId: uuid(5), siteId: uuid(6)},
      {...base, classEnrollmentId: uuid(7), classId: uuid(8), siteId: uuid(10)},
    ], now, [{id: uuid(6), name: "Center A"}]);
    expect(records).toHaveLength(2);
    expect(records[0]?.siteName).toBe("Center A");
    expect(records[1]?.siteName).toBeNull();
    expect(records[0]?.key).not.toBe(records[1]?.key);
    expect(records[0]?.action?.href).toBe(shortUuidHref("/class/",uuid(5))+"?view=learn&tab=lessons");
  });
  it("hides current-class actions after withdrawal", () => {
    const records = projectNativeClasses([{
      classEnrollmentId: uuid(4), classId: uuid(5), title: "AI",
      status: "withdrawn", deliveryMode: "online",
      courseAttemptId: uuid(9), enrolledAt: now, siteId: null,
    }], now);
    expect(records[0]).toMatchObject({status: "withdrawn", bucket: "history", action: null});
  });
  it("noncredit withdrawal overrides a stale active Course Attempt", () => {
    const record = projectNoncreditCourses([{
      releaseId: uuid(1), registrationId: uuid(2), courseAttemptId: uuid(3),
      trainingTitle: "AI Foundations", deliveryMode: "facilitated",
      siteName: "Center B", registrationStatus: "withdrawn", attemptStatus: "active",
      registeredAt: now, upcomingSessions: [],
    }], now)[0];
    expect(record).toMatchObject({bucket: "history", status: "withdrawn", action: null});
    expect(record?.refs).toEqual({
      releaseId: uuid(1), registrationId: uuid(2), courseAttemptId: uuid(3),
    });
  });
  it("preserves an adult training next session and exact Course Attempt reference", () => {
    const record = projectNoncreditCourses([{
      releaseId: uuid(1), registrationId: uuid(2), courseAttemptId: uuid(3),
      trainingTitle: "Digital Skills", deliveryMode: "facilitated",
      siteName: "Center B", registrationStatus: "registered", attemptStatus: "active",
      registeredAt: now, upcomingSessions: [
        {startsAt: "2026-12-01T19:00:00Z", endsAt: "2026-12-01T20:00:00Z"},
      ],
    }], now)[0];
    expect(record?.bucket).toBe("current");
    expect(record?.nextAt).toBe("2026-12-01T19:00:00.000Z");
    expect(record?.progress).toBeNull();
    expect(record?.outcome).toBeNull();
  });
  it("keeps invitations outside participation records and completion counts", () => {
    const opportunities = projectNoncreditOpportunities([{
      releaseId: uuid(1), title: "Summer Learning", status: "invited",
      joinedAt: now, inviteExpiresAt: "2026-11-18T00:00:00Z",
      invitationActive: true,
    }]);
    expect(opportunities).toHaveLength(1);
    expect(opportunities[0]).toMatchObject({
      source: "noncredit_waitlist", state: "invited",
      releaseId: uuid(1), expiresAt: "2026-11-18T00:00:00.000Z",
    });
    expect(opportunities[0]?.action?.label).toBe("Claim invitation");
    const records = assembleParticipation([]);
    expect(records).toHaveLength(0);
    expect(resolveActivityFilters(records, "upcoming", "program")).toHaveLength(0);
  });
  it("does not equate an expired invitation with cancelled enrollment", () => {
    const opportunities = projectNoncreditOpportunities([{
      releaseId: uuid(1), title: "AI Skills", status: "expired",
      joinedAt: now, inviteExpiresAt: "2026-11-14T00:00:00Z",
      invitationActive: false,
    }]);
    expect(opportunities[0]?.state).toBe("expired");
    expect(opportunities[0]?.action?.label).toBe("Manage waiting list");
  });
  it("deduplicates repeated release-scoped opportunities without inventing waitlist IDs", () => {
    const item = {releaseId: uuid(1), title: "AI Skills", status: "waiting",
      joinedAt: now, inviteExpiresAt: null, invitationActive: false};
    expect(projectNoncreditOpportunities([item, item])).toHaveLength(1);
    expect(projectNoncreditOpportunities([item])[0]?.key).toBe("noncredit_waitlist_release:" + uuid(1));
  });
  it("projects a guardian's independently permitted dependent program", () => {
    const records = projectFamilyEnrichment([{
      id: uuid(1), studentProfileId: uuid(2), seasonId: uuid(3),
      offeringName: "Summer Art", seasonName: "Summer",
      status: "registered", startsOn: "2026-12-01", endsOn: "2027-02-01",
    }], [{studentProfileId: uuid(2), name: "Sample", lastName: "Student"}], now);
    expect(records[0]?.subject).toEqual({kind: "dependent", displayName: "Sample Student"});
    expect(records[0]?.kind).toBe("program");
    expect(records[0]?.bucket).toBe("upcoming");
    expect(records[0]?.action?.href).toBe("/guardian/enrichment");
  });
  it("filters invalid dependent links rather than exposing unmatched registrations", () => {
    expect(projectFamilyEnrichment([{
      id: uuid(1), studentProfileId: uuid(99), seasonId: uuid(3),
      offeringName: "Restricted activity", seasonName: "Private",
      status: "registered", startsOn: null, endsOn: null,
    }], [{studentProfileId: uuid(2), name: "Sample", lastName: "Student"}], now)).toEqual([]);
  });
  it("keeps status, type and timeline filters independent", () => {
    const school = projectSchoolSections([{
      id: uuid(2), title: "History", code: "HIS",
      enrollmentId: uuid(3), enrollmentStatus: "active",
    }], now);
    const programs = projectFamilyEnrichment([{
      id: uuid(4), studentProfileId: uuid(5), seasonId: uuid(6),
      offeringName: "Summer Learning", seasonName: "Summer",
      status: "registered", startsOn: "2027-06-01", endsOn: "2027-07-01",
    }], [{studentProfileId: uuid(5), name: "Sample", lastName: "Child"}], now);
    const records = assembleParticipation([...programs, ...school]);
    expect(resolveActivityFilters(records, "current", "learning")).toHaveLength(1);
    expect(resolveActivityFilters(records, "upcoming", "program")).toHaveLength(1);
    expect(resolveActivityFilters(records, "upcoming", "event")).toHaveLength(0);
    expect(() => assertUniqueParticipationKeys(records)).not.toThrow();
    expect(() => assertUniqueParticipationKeys([...school, ...school])).toThrow();
  });
  it("enforces shared source identity and collection separation for WS2–WS6 consumers", () => {
    const record = projectSchoolSections([{
      id: uuid(1), title: "Logic", code: "LOG",
      enrollmentId: uuid(2), enrollmentStatus: "active",
    }], now)[0]!;
    const opportunity = projectNoncreditOpportunities([{
      releaseId: uuid(3), title: "AI", status: "waiting",
      joinedAt: now, inviteExpiresAt: null, invitationActive: false,
    }])[0]!;
    const projection: ParticipationReadModel = {
      version: PARTICIPATION_READ_MODEL_VERSION,
      generatedAt: now.toISOString(), viewerRole: "student", activeGrantId: uuid(4),
      records: [record], opportunities: [opportunity],
      sources: [
        {source: "school_section", state: "ready", coverage: "partial", message: null},
        {source: "noncredit_waitlist", state: "ready", coverage: "partial", message: null},
      ],
    };
    expect(() => assertParticipationReadModel(projection)).not.toThrow();
    expect(() => assertParticipationReadModel({
      ...projection, records: [{...record, key: "school_section:" + uuid(99)}],
    })).toThrow(/identity/);
    expect(() => assertParticipationReadModel({
      ...projection, opportunities: [opportunity, opportunity],
    })).toThrow(/Duplicate enrollment opportunity/);
    expect(() => assertParticipationReadModel({
      ...projection, sources: [{source: "school_section", state: "unavailable",
        coverage: "complete", message: null}],
    })).toThrow(/complete coverage/);
  });
  it("deduplicates repeated source rows without combining unrelated enrollments", () => {
    const one = projectSchoolSections([{
      id: uuid(1), title: "Science", code: "SCI",
      enrollmentId: uuid(2), enrollmentStatus: "active",
    }], now);
    const two = projectNativeClasses([{
      classEnrollmentId: uuid(2), classId: uuid(3), title: "Science",
      courseAttemptId: null, status: "pending", deliveryMode: "online",
      enrolledAt: now, siteId: null,
    }], now);
    expect(assembleParticipation([...one, ...one, ...two])).toHaveLength(2);
  });
  it("projects only authoritative school Program enrollments, with dependent identity",()=>{
    const program=projectSchoolPrograms([{
      enrollmentId:uuid(11),programId:uuid(12),studentProfileId:uuid(13),
      title:"Summer Learning",status:"active",
      organizationId:uuid(14),organizationName:"Authorized provider",
      siteId:uuid(15),siteName:"Center A",subjectKind:"dependent",subjectName:null,
      startsAt:"2026-11-10",endsAt:"2026-12-15",
    }],now)[0]!;
    expect(program).toMatchObject({
      source:"school_program",sourceId:uuid(11),kind:"program",
      refs:{enrollmentId:uuid(11),programId:uuid(12)},
      subject:{kind:"dependent",displayName:null},outcome:null,
    });
    expect(program.action?.href).toBe("/guardian/students");
    const model:ParticipationReadModel={
      version:PARTICIPATION_READ_MODEL_VERSION,generatedAt:now.toISOString(),
      viewerRole:"guardian",activeGrantId:uuid(17),records:[program],
      opportunities:[],sources:[{source:"school_program",state:"ready",coverage:"partial",message:null}],
    };
    expect(()=>assertParticipationReadModel(model)).not.toThrow();
  });
  it("records an accepted calendar event without inventing attendance or completion",()=>{
    const record=projectAcceptedCalendarEvents([{
      participantId:uuid(20),eventId:uuid(21),title:"Community Workshop",
      startsAt:"2026-11-14T14:00:00Z",endsAt:"2026-11-14T15:00:00Z",
      organizationId:uuid(22),siteId:uuid(23),programId:uuid(24),cancelled:false,
    }],now)[0]!;
    expect(record).toMatchObject({
      source:"calendar_event",sourceId:uuid(20),kind:"event",
      bucket:"history",status:"scheduled",outcome:null,
      refs:{calendarEventId:uuid(21),calendarEventParticipantId:uuid(20)},
    });
    const model:ParticipationReadModel={
      version:PARTICIPATION_READ_MODEL_VERSION,generatedAt:now.toISOString(),
      viewerRole:"student",activeGrantId:uuid(25),records:[record],
      opportunities:[],sources:[{source:"calendar_event",state:"ready",coverage:"partial",message:null}],
    };
    expect(()=>assertParticipationReadModel(model)).not.toThrow();
    expect(()=>assertParticipationReadModel({...model,records:[{
      ...record,sourceId:uuid(99),
    }]})).toThrow(/identity/);
  });
  it("shows only explicitly supplied Class decision provenance, not enrollment completion",()=>{
    const classes=projectNativeClasses([{
      classEnrollmentId:uuid(30),classId:uuid(31),title:"AI Training",
      status:"withdrawn",courseAttemptId:uuid(32),deliveryMode:"facilitated",
      enrolledAt:now,siteId:null,
      officialOutcome:{label:"Completion decision: pass",referenceId:uuid(33)},
    }],now);
    expect(classes[0]).toMatchObject({
      bucket:"history",action:null,
      outcome:{label:"Completion decision: pass",referenceId:uuid(33)},
    });
  });

});

it("projects nine current native Classes and one withdrawn record without granting history playback",()=>{
 const records=projectNativeClasses(Array.from({length:10},(_,i)=>({classEnrollmentId:uuid(100+i),classId:uuid(200+i),title:"Class "+i,status:i===9?"withdrawn":"active",deliveryMode:"self_paced",courseAttemptId:i===9?null:uuid(300+i),enrolledAt:now,siteId:uuid(400)})),now);
 expect(resolveActivityFilters(records,"current","learning")).toHaveLength(9);
 expect(resolveActivityFilters(records,"history","all")).toHaveLength(1);
 expect(records[9]?.action).toBeNull();
 expect(records.slice(0,9).every(r=>r.action?.href.startsWith("/class/"))).toBe(true);
});
