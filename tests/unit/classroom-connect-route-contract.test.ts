import { describe, it, expect } from "vitest";
import { classroomJoinPath, displayClassroomCode } from "@/domain/classroom-connect";
describe("Classroom Connect safe route contracts", () => {
 it("normalizes manually entered and scanned codes identically", () => {
   expect(classroomJoinPath("abcde-fghj2")).toBe("/join/ABCDEFGHJ2");
   expect(displayClassroomCode("abcde fghj2")).toBe("ABCDE-FGHJ2");
 });
 it("does not accept partial, URL-like or 6-character legacy codes", () => {
   for (const code of ["ABC123", "//evil", "../join", "ABCDEFGH0J"]) {
     expect(() => classroomJoinPath(code)).toThrow();
   }
 });
});
