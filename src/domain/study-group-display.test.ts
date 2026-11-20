import { describe, expect, it } from "vitest";
import { groupKindLabel, nextGroupSession, type StudyGroupRecord } from "./study-group-display";

const group = {
  kind: "course",
  sessions: [
    {id:"cancelled",startsAt:"2026-11-20T10:00:00.000Z",cancelled:true},
    {id:"past",startsAt:"2026-11-18T10:00:00.000Z",cancelled:false},
    {id:"next",startsAt:"2026-11-21T10:00:00.000Z",cancelled:false},
  ],
} as unknown as StudyGroupRecord;

describe("shared group display logic", () => {
  it("uses the same names for the group directory and detail workspace", () => {
    expect(groupKindLabel("course")).toBe("Course group");
    expect(groupKindLabel("interest")).toBe("Interest group");
  });
  it("skips cancelled and past meetings without inferring attendance", () => {
    const next = nextGroupSession(group, Date.parse("2026-11-19T00:00:00.000Z"));
    expect(next?.id).toBe("next");
  });
  it("renders no next session once all eligible meetings have ended", () => {
    expect(nextGroupSession(group, Date.parse("2026-12-01T00:00:00.000Z"))).toBeNull();
  });
});
