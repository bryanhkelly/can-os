import {readFileSync} from "node:fs";
import {describe,expect,it} from "vitest";

const source=readFileSync(
  new URL("../../src/components/learning/FacilitatedLearnerPairing.tsx",import.meta.url),"utf8",
);

describe("V6.1 facilitator pairing feedback for an owned learner attempt",()=>{
  it("never turns pairing or playback into fabricated attendance",()=>{
    expect(source).toContain("pairWithFacilitatedRoom({data:{courseAttemptId,pairingCode:code.trim()}})");
    expect(source).toContain("leaveFacilitatedRoom({data:{courseAttemptId,facilitatedSessionId:roomId}})");
    expect(source).toContain("Room connection is not attendance or proof of video viewing.");
    expect(source).not.toContain("markAttendance");
    expect(source).not.toContain("markLessonComplete");
  });
  it("composes shared query, field, and notice primitives with action-specific severity",()=>{
    expect(source).toContain("<QueryState");
    expect(source).toContain("<WorkspaceNotice tone={messageTone}");
    expect(source).toContain('<WorkspaceNotice tone="attention"');
    expect(source).toContain("<Input");
    expect(source).toContain("<Label");
    expect(source).toContain('setMessageTone("danger")');
    expect(source).toContain('setMessageTone("success")');
  });
  it("does not silently present stale room state after polling fails",()=>{
    expect(source).toContain("setObservationUnavailable(true)");
    expect(source).toContain("setObservationUnavailable(false)");
    expect(source).toContain("Previous pairing details may be outdated.");
    expect(source).toContain("Retry room status");
    expect(source).toContain("if(live)");
  });
});
