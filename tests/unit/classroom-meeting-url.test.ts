import { describe, expect, it } from "vitest";
import { classroomMeetingUrl, readClassroomMeetingUrl } from "@/domain/classroom-meeting";

describe("classroom meeting URL authorization boundary", () => {
  it("accepts ordinary HTTPS meeting links and their supported paths", () => {
    for (const value of [
      "https://meet.example.test/class/123",
      "https://meet.example.test:8443/class/123",
      "https://video.example.test/join?meeting=123",
    ]) {
      expect(classroomMeetingUrl.safeParse(value).success).toBe(true);
      expect(readClassroomMeetingUrl({ classroomMeetingUrl: value })).toBe(value);
    }
  });

  it("never exposes invalid persisted links or breaks calendar reads", () => {
    for (const value of [
      "http://meet.example.test/room",
      "javascript:alert(1)",
      "data:text/html,<h1>unsafe</h1>",
      "https://user:password@meet.example.test/room",
      "//meet.example.test/room",
      "not a meeting URL",
      42,
      {},
    ]) {
      expect(classroomMeetingUrl.safeParse(value).success).toBe(false);
      expect(readClassroomMeetingUrl({ classroomMeetingUrl: value })).toBeNull();
    }
    expect(readClassroomMeetingUrl({})).toBeNull();
    expect(readClassroomMeetingUrl({ classroomMeetingUrl: null })).toBeNull();
  });

  it("enforces the same length boundary used by scheduling and link edits", () => {
    const longUrl = "https://meet.example.test/" + "x".repeat(2050);
    expect(classroomMeetingUrl.safeParse(longUrl).success).toBe(false);
    expect(readClassroomMeetingUrl({ classroomMeetingUrl: longUrl })).toBeNull();
  });
});
