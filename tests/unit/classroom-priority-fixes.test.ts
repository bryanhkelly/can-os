import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("Classroom Connect P1 authorization and feedback boundaries", () => {
  it("does not use an arbitrary Course attempt to authorize facilitator media", () => {
    const api = read("src/modules/learning/facilitated-learning.functions.ts");
    expect(api).not.toContain("representativeAttempt");
    expect(api).toContain("currentRoomMediaAudience");
    expect(api).toContain("facilitatedLearningParticipants.courseAttemptId");
    expect(api).toContain("isNull(facilitatedLearningParticipants.leftAt)");
    expect(api).toContain("schoolAttemptIsPlacedAtSite(");
    expect(api).toContain("eq(learnerProfiles.personId, participantPersonId)");
    expect(api).toContain("eq(noncreditRegistrations.participantPersonId, participantPersonId)");
    expect(api).toContain("eligibleAdoptions.set(attempt.adoptionId, attempt)");
    expect(api).toContain("assertRoomMediaRightsForAudience");
    expect(api.split("assertAuthorizedFacilitatedRoomMedia(").length - 1).toBe(3);
    // Media lists, signed URLs, and playback event writes all pass through
    // the same current audience / adoption enforcement, not a stale token.
    expect(api.split("currentRoomMediaAudience(tx, room)").length - 1).toBe(2);
    expect(api.split("assertRoomMediaRightsForAudience(").length - 1).toBe(3);
  });

  it("derives operational expiry on the server and updates the open browser", () => {
    const api = read("src/modules/learning/facilitated-learning.functions.ts");
    const route = read("src/routes/canonical.lab.facilitated.tsx");
    expect(api).toContain("state: facilitatedRoomOperationalState(room, now)");
    expect(api).toContain("expiresAt: new Date(room.startedAt.getTime() + facilitatedRoomMaxMs)");
    expect(route).toContain("effectiveRoomState(room, clockMs)");
    expect(route).toContain("setInterval(() => setClockMs(Date.now()), 15_000)");
    expect(route).toContain('roomState==="expired"?"Expired":"Live"');
    expect(route).toContain('roomState==="live"&&<ClassroomFacilitatorConsole');
  });

  it("exposes live availability only when the restricted session reader is callable", () => {
    const probe = read("src/modules/identity/canonical-command-context.server.ts");
    const availability = read("src/modules/learning/canonical-learning-release.functions.ts");
    expect(probe).toContain("canonicalRestrictedAuthUrlValid(");
    expect(probe).toContain("BEGIN READ ONLY");
    expect(probe).toContain("SET LOCAL ROLE");
    expect(probe).toContain("education_v30.v301_canonical_session_context($1::text)");
    expect(probe).toContain("result.rows.length === 0");
    expect(availability).toContain("configured && await probeCanonicalAuthReader()");
    expect(availability).toContain("facilitated: readerReady && facilitatedLearningRuntimeReady()");
    expect(availability).not.toContain("process.env.CAN_FACILITATED_LEARNING_ENABLED");
  });

  it("stores optional feedback only for a person's own paired Course attempt", () => {
    const feedback = read("src/modules/learning/classroom-feedback.functions.ts");
    const mapping = read("src/db/canonical-v301/facilitated-room-feedback.ts");
    const companion = read("src/routes/classroom.companion.tsx");
    const report = read("src/modules/learning/facilitated-impact.functions.ts");
    expect(feedback).toContain("authorizeCanonicalCourseAttempt(tx, actor, courseAttemptId, true)");
    expect(feedback).toContain("eq(facilitatedLearningParticipants.participantPersonId, actor.actorPersonId!)");
    expect(feedback).toContain("classroomFeedbackOpen(row.room, new Date())");
    expect(feedback).toContain("onConflictDoUpdate");
    expect(mapping).toContain('educationV30.table("facilitated_room_feedback"');
    const migration = read("database/canonical/v3.0.1/patch-facilitated-room-feedback.sql");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS education_v30.facilitated_room_feedback");
    expect(migration).toContain("FORCE ROW LEVEL SECURITY");
    expect(migration).toContain("facilitated_evidence_owner_only");
    expect(migration).toContain("REVOKE ALL ON TABLE education_v30.facilitated_room_feedback FROM PUBLIC");
    expect(companion).toContain("getRecentClassroomFeedback");
    expect(companion).toContain("submitClassroomFeedback");
    expect(companion).toContain('aria-pressed={room.ratings[questionKey] === rating}');
    expect(report).toContain("countDistinct(facilitatedRoomFeedback.participantPersonId)");
    expect(report).toContain("people>=5");
    expect(feedback).not.toContain("assessmentAttempts");
    expect(feedback).not.toContain("noncreditCompletionDecisions");
  });
});
