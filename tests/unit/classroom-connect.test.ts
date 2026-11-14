import { describe, expect, it } from "vitest";
import { classroomJoinPath, displayClassroomCode } from "@/domain/classroom-connect";

describe("Classroom Connect canonical pairing URLs", () => {
  it("uses the existing ten-character canonical pairing code", () => {
    expect(classroomJoinPath("ABCD2-EFGH3")).toBe("/join/ABCD2EFGH3");
    expect(displayClassroomCode("abcd2 efgh3")).toBe("ABCD2-EFGH3");
  });
  it("rejects the obsolete six-character classroom codes", () => {
    expect(() => classroomJoinPath("ABC234")).toThrow("Invalid pairing code");
  });
  it("rejects forbidden or unsafe characters", () => {
    expect(() => classroomJoinPath("../login")).toThrow("Invalid pairing code");
    expect(() => classroomJoinPath("ABCD0-EFGH3")).toThrow("Invalid pairing code");
  });
});
