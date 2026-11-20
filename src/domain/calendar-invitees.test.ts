import { describe, expect, it } from "vitest";
import { countCalendarInvitees } from "./calendar-invitees";

describe("calendar invitation participant counting", () => {
  const groups = [
    { id: "g1", members: [{ personId: "a" }, { personId: "b" }] },
    { id: "g2", members: [{ personId: "b" }, { personId: "c" }] },
  ];
  it("counts unique invitees across overlapping groups and people", () => {
    expect(countCalendarInvitees(groups, ["g1", "g2"], ["a", "d"])).toBe(4);
  });
  it("ignores unknown group selections and does not mutate inputs", () => {
    expect(countCalendarInvitees(groups, ["unavailable"], ["a", "a"])).toBe(1);
    expect(groups[0]!.members).toHaveLength(2);
  });
});
