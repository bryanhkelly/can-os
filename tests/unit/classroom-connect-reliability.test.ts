import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  classroomPendingKey, classroomPendingTtlMs,
  readPendingClassroomResponse, writePendingClassroomResponse,
  clearPendingClassroomResponse,
} from "@/domain/classroom-response-recovery";

function storage() {
  const data = new Map<string,string>();
  return {
    getItem: (key:string)=>data.get(key)??null,
    setItem: (key:string,value:string)=>{data.set(key,value);},
    removeItem: (key:string)=>{data.delete(key);},
  };
}
const uuid="11111111-1111-4111-8111-111111111111";
const sample={
  clientSubmissionId:uuid,clientInstanceId:uuid,answer:"2",savedAt:10_000,
};
const source=(path:string)=>readFileSync(resolve(process.cwd(),path),"utf8");

describe("Classroom Connect reliability and integration",()=>{
  it("scopes response recovery to exact course, room, release and current browser tab",()=>{
    const key=classroomPendingKey("course","room","release");
    expect(key).toContain("can-classroom-pending:");
    expect(key).not.toEqual(classroomPendingKey("course","other-room","release"));
    const mem=storage();
    expect(writePendingClassroomResponse(mem,key,sample)).toBe(true);
    expect(readPendingClassroomResponse(mem,key,10_200)).toEqual(sample);
    clearPendingClassroomResponse(mem,key);
    expect(readPendingClassroomResponse(mem,key,10_201)).toBeNull();
  });
  it("removes expired, malformed and future-dated submissions",()=>{
    const mem=storage(),key="can-classroom-pending:test";
    mem.setItem(key,JSON.stringify(sample));
    expect(readPendingClassroomResponse(mem,key,sample.savedAt+classroomPendingTtlMs+1)).toBeNull();
    mem.setItem(key,JSON.stringify({...sample,savedAt:20_000}));
    expect(readPendingClassroomResponse(mem,key,19_999)).toBeNull();
    mem.setItem(key,"not-json");
    expect(readPendingClassroomResponse(mem,key,10_100)).toBeNull();
  });
  it("uses one room cache, revalidates on reconnect, and never trusts a stale access failure",()=>{
    const hook=source("src/components/learning/useLearnerClassroomRooms.ts");
    const native=source("src/components/learning/NativeClassroomCompanion.tsx");
    const pairing=source("src/components/learning/FacilitatedLearnerPairing.tsx");
    const legacy=source("src/routes/classroom.companion.tsx");
    expect(hook).toContain("refetchOnReconnect: true");
    expect(hook).toContain("refetchOnWindowFocus: true");
    expect(hook).toContain("retry: false");
    expect(native).toContain("useLearnerClassroomRooms(courseAttemptId)");
    expect(pairing).toContain("useLearnerClassroomRooms(courseAttemptId)");
    expect(legacy).toContain("useLearnerClassroomRooms(courseAttemptId)");
    expect(native).toContain("rooms.isSuccess&&rooms.data.rooms.map");
    expect(legacy).toContain("rooms.isSuccess && rooms.data.rooms.map");
  });
  it("embeds surveys, provides source-backed preflight and segregates host health from projector",()=>{
    const native=source("src/components/learning/NativeClassroomCompanion.tsx");
    const feedback=source("src/components/learning/ClassroomFeedbackPanel.tsx");
    const preflight=source("src/components/learning/NativeClassSessionsPanel.tsx");
    const host=source("src/components/learning/ClassroomFacilitatorConsole.tsx");
    const projector=source("src/routes/classroom.$sessionId.presentation.tsx");
    expect(native).toContain("<ClassroomFeedbackPanel courseAttemptId={courseAttemptId}/>");
    expect(feedback).toContain("ClassroomGovernedLearnerSurveys");
    expect(feedback).toContain("submitClassroomFeedback");
    expect(preflight).toContain('aria-label="Verified classroom prerequisites"');
    expect(preflight).toContain("Video authorization:</strong> Checked at playback");
    expect(host).toContain('aria-label="Classroom connection health"');
    expect(host).toContain("room.dataUpdatedAt");
    expect(host).toContain("getClassroomProjectorCommand");
    expect(host).toContain("failedCommands");
    expect(host).toContain("onCommandStatus=");
    expect(source("src/components/learning/ClassroomPlaybackControls.tsx")).toContain("onCommandStatus?.(\"failed\",kind)");
    expect(projector).not.toContain("Classroom connection health");
    expect(projector).not.toContain("respondingLearners");
  });
});
