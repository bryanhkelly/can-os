import {describe, expect, it} from "vitest";
import {
  PARTICIPATION_READ_MODEL_VERSION, activityBucket, activityStatusLabel,
  resolveActivityFilters, assertUniqueParticipationKeys,
} from "@/domain/participation-read-model";
import {
  assembleParticipation, projectFamilyEnrichment, projectNativeClasses,
  projectNoncreditCourses, projectNoncreditWaitlists, projectSchoolSections,
} from "@/domain/participation-projections";

const now = new Date("2026-11-16T19:00:00.000Z");
const uuid = (n: number) => "00000000-0000-4000-8000-" + n.toString().padStart(12, "0");
describe("Participation Read Model v1", () => {
  it("exposes a stable version and never infers an outcome from dates", () => {
    expect(PARTICIPATION_READ_MODEL_VERSION).toBe("1.0.0");
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
    expect(records[0]?.action?.href).toContain(uuid(5));
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
  it("never represents an invited waitlist as a completed course", () => {
    const record = projectNoncreditWaitlists([{
      releaseId: uuid(1), title: "Summer Learning", status: "invited",
      joinedAt: now, inviteExpiresAt: "2026-11-18T00:00:00Z",
      invitationActive: true,
    }], now)[0];
    expect(record).toMatchObject({
      source: "noncredit_waitlist", status: "invited", bucket: "upcoming",
      outcome: null, progress: null,
    });
    expect(record?.refs.courseAttemptId).toBeUndefined();
    expect(record?.action?.label).toBe("Claim invitation");
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
});
