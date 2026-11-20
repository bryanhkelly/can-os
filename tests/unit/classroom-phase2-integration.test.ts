import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  classroomCodeFromFragment, classroomQrJoinUrl, displayClassroomCode,
} from "@/domain/classroom-connect";

const source = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

describe("Classroom Connect Phase 2 join and privacy", () => {
  it("includes classroom browser acceptance in the guarded Playwright runner", () => {
    const config = source("playwright.authenticated-routes.config.ts");
    const pkg = JSON.parse(source("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts["test:classroom:browser"]).toContain("tests/e2e/classroom-connect.spec.ts");
    expect(config).toContain('"classroom-connect.spec.ts"');
    expect(config).toContain('CAN_TEST_DB_WRITES_ENABLED');
    expect(config).toContain("requireLocalHttpUrl");
  });
  it("encodes QR pairing codes only as disposable fragments", () => {
    const qr = classroomQrJoinUrl("https://can.example.org", "ABCDE-FGHJK");
    const uri = new URL(qr);
    expect(uri.pathname).toBe("/join");
    expect(uri.search).toBe("");
    expect(uri.hash).toBe("#pair=ABCDEFGHJK");
    expect(classroomCodeFromFragment(uri.hash)).toBe("ABCDEFGHJK");
    expect(displayClassroomCode("ABCDEFGHJK")).toBe("ABCDE-FGHJK");
    expect(classroomCodeFromFragment("#pair=INVALID")).toBeNull();
    expect(classroomCodeFromFragment("#code=ABCDEFGHJK")).toBeNull();
  });
  it("keeps the QR local and scrubs code before optional sign-in", () => {
    const qr = source("src/components/learning/ClassroomConnectQr.tsx");
    const join = source("src/routes/join.tsx");
    expect(qr).toContain('import("qrcode")');
    expect(qr).toContain("classroomQrJoinUrl");
    expect(join).toContain("classroomCodeFromFragment(window.location.hash)");
    expect(join).toContain("window.history.replaceState");
    expect(join).toContain('to="/access"');
    expect(join).toContain('returnTo:"/join"');
    expect(join).not.toContain('navigate({ to: "/join/$code"');
  });
  it("separates the room projector from the facilitator's private activity summary", () => {
    const presentation = source("src/routes/classroom.$sessionId.presentation.tsx");
    const evidence = source("src/modules/learning/classroom-evidence.functions.ts");
    expect(presentation).toContain("getClassroomPresentationState");
    expect(presentation).not.toContain("getClassroomHostActivity");
    expect(presentation).not.toContain("facilitatedRoomActivityResponses");
    const projectorOnly = evidence.slice(evidence.indexOf("export const getClassroomPresentationState"));
    expect(projectorOnly).toContain("facilitatedRoomActivityReleases.prompt");
    expect(projectorOnly).not.toContain("facilitatedRoomActivityResponses");
    expect(projectorOnly).not.toContain("participantPersonId");
    expect(projectorOnly).not.toContain("facilitatedRoomPresenceEvents");
  });
  it("stops queued playback if the active room or distribution rights are revoked", () => {
    const projector = source("src/modules/learning/classroom-projector.functions.ts");
    const player = source("src/components/learning/ClassroomProjectorPlayer.tsx");
    expect(projector).toContain("assertAuthorizedFacilitatedRoomMedia(");
    expect(projector).toContain('roomState: "blocked"');
    expect(projector).not.toContain("representativeAttempt");
    expect(projector).toContain("facilitatedRoomOperationalState(room, new Date())");
    expect(player).toContain('if(roomState&&roomState!=="live")');
    expect(player).toContain("setLoaded(null)");
  });
});

describe("Classroom Connect Phase 2 learner activities", () => {
  it("requires an active registered learner in the precise room and Site", () => {
    const api = source("src/modules/learning/classroom-evidence.functions.ts");
    expect(api).toContain("authorizeCanonicalCourseAttempt(tx, actor, courseAttemptId)");
    expect(api).toContain("roomHostIsCurrent(tx, room, now)");
    expect(api).toContain("schoolAttemptIsPlacedAtSite(");
    expect(api).toContain("eq(facilitatedLearningParticipants.participantPersonId, actor.actorPersonId)");
    expect(api).toContain("isNull(facilitatedLearningParticipants.leftAt)");
    expect(api).toContain("facilitatedRoomOperationalState(room, now)");
  });
  it("deduplicates retries without converting formative work into grades", () => {
    const api = source("src/modules/learning/classroom-evidence.functions.ts");
    const companion = source("src/components/learning/ClassroomCompanionRoom.tsx");
    expect(api).toContain("prior.clientInstanceId !== data.clientInstanceId");
    expect(api).toContain("Conflicting learner response retry");
    expect(api).toContain("open classroom activity and matching answer");
    expect(api).toContain("return { saved: true, duplicate: true, graded: false }");
    expect(api).not.toContain("noncreditCompletionDecisions");
    expect(api).not.toContain("assessmentAttemptResults");
    expect(companion).toContain("clientSubmissionId");
    expect(companion).toContain("retryIds.current[key]");
    expect(companion).toContain("recordClassroomPresence");
  });
  it("preserves the exact unconfirmed response across closure and never treats refresh failure as write failure", () => {
    const api = source("src/modules/learning/classroom-evidence.functions.ts");
    const companion = source("src/components/learning/ClassroomCompanionRoom.tsx");
    // Server checks an immutable matching submission before testing closure.
    const handler = api.slice(api.indexOf("export const submitClassroomResponse"),
      api.indexOf("const presenceInput"));
    expect(handler.indexOf("if (prior)")).toBeLessThan(handler.indexOf("if (release.closedAt"));
    expect(handler).toContain("prior.answerText !== data.answerText");
    expect(handler).toContain("prior.answerChoice !== data.answerChoice");
    // Client keeps both the idempotency key AND payload during unknown outcome.
    expect(companion).toContain("pendingAnswers.current[key]=answer");
    expect(companion).toContain("pendingAnswers.current[activity.id]??answers[activity.id]");
    expect(companion).toContain("!activity.responded&&(!activity.closed||!!retryIds.current[activity.id])");
    expect(companion).toContain("disabled={activity.closed||!!retryIds.current[activity.id]}");
    expect(companion).toContain("Confirm previous submission");
    expect(companion).toContain("void queryClient.invalidateQueries");
    expect(companion).toContain(".catch(()=>{})");
  });
  it("rehearses a specific approved adoption without a fabricated learner", () => {
    const preview = source("src/modules/learning/classroom-rehearsal.functions.ts");
    const rights = source("src/modules/learning/student-instructional-tracks.server.ts");
    expect(preview).toContain("getClassroomRehearsalChoices");
    expect(preview).toContain("eq(deploymentOfferingAdoptions.id,data.adoptionId)");
    expect(preview).toContain("assertFacilitatedInstructionalPreview");
    expect(rights).toContain("export async function assertFacilitatedInstructionalPreview(");
    expect(preview).not.toContain("representativeAttempt");
    expect(preview).not.toContain("tx.insert(learnerCourseAttempts)");
  });
});
