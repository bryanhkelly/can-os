import { describe, expect, it } from "vitest";
import {
  applicationPacketSchema, applicationPacketProgress, applicationPacketFieldIssues, emptyApplicationPacket, readApplicationPacket,
} from "@/domain/application-packet";

describe("core application packet", () => {
  it("allows incomplete drafts while identifying every blocking section", () => {
    const packet = applicationPacketSchema.parse(emptyApplicationPacket());
    const progress = applicationPacketProgress(packet, "");
    expect(Object.values(progress).every(items => items.length > 0)).toBe(true);
  });
  it("preserves legacy applications without inventing completed data", () => {
    expect(readApplicationPacket({})).toBeNull();
    expect(Object.values(applicationPacketProgress(null, "Old statement")).every(items => items.length > 0)).toBe(true);
  });
  it("rejects malformed versions, unknown fields, and invalid dates", () => {
    expect(() => applicationPacketSchema.parse({ ...emptyApplicationPacket(), version: 2 })).toThrow();
    expect(() => applicationPacketSchema.parse({ ...emptyApplicationPacket(), permission: "guardian" })).toThrow();
    const packet = emptyApplicationPacket();
    packet.student.birthDate = "2011-02-30";
    expect(() => applicationPacketSchema.parse(packet)).toThrow("valid date");
  });
  it("rejects invalid contact email and nonconsecutive school years", () => {
    const packet = emptyApplicationPacket();
    packet.households[0]!.contacts[0]!.email = "not-an-email";
    packet.schoolYear = "2026-2030";
    expect(applicationPacketSchema.safeParse(packet).success).toBe(false);
    const progress = applicationPacketProgress(packet, "");
    expect(progress.family).toContain("Household 1, contact 1: Enter a valid contact email");
    expect(progress.student).toContain("Requested school year: Use consecutive years, for example 2026-2027");
  });
  it("never marks a populated contact section ready when its email is invalid", () => {
    const packet = emptyApplicationPacket();
    packet.households = [{
      name: "Example", address: { line1: "123 Example Lane", line2: "", city: "Example City", region: "CA", postalCode: "90000", country: "US" },
      contacts: [{ firstName: "Pat", lastName: "Example", relationship: "Parent", email: "dsdsfds", phone: "202-555-0100" }],
    }];
    expect(applicationPacketProgress(packet, "Reason").family).toEqual(["Household 1, contact 1: Enter a valid contact email"]);
    packet.households[0]!.contacts[0]!.email = "pat@example.test";
    expect(applicationPacketProgress(packet, "Reason").family).toEqual([]);
  });
  it("does not allow first-school claims to hide contradictory history", () => {
    const packet = emptyApplicationPacket();
    packet.history.firstSchool = true;
    packet.history.schools = [{ name: "Example", location: "", grade: "", from: "", to: "", reasonForLeaving: "" }];
    expect(applicationPacketSchema.safeParse(packet).success).toBe(false);
  });
  it("rejects reversed attendance dates", () => {
    const packet = emptyApplicationPacket();
    packet.history.schools = [{ name: "Example", location: "", grade: "", from: "2025-01-01", to: "2024-01-01", reasonForLeaving: "" }];
    expect(applicationPacketSchema.safeParse(packet).success).toBe(false);
  });
  it("does not count a future date of birth as ready", () => {
    const packet = emptyApplicationPacket();
    packet.schoolYear = "2026-2027"; packet.student.primaryLanguage = "English";
    packet.student.birthDate = "2099-01-01";
    expect(applicationPacketProgress(packet, "", "2026-10-20").student).toEqual(["Enter a date of birth before today."]);
  });
  it("checks additional households and siblings rather than only the first contact", () => {
    const packet = emptyApplicationPacket();
    packet.siblings = [{ name: "Sibling", grade: "", school: "" }];
    const issues = applicationPacketFieldIssues(packet, "");
    expect(issues).toContainEqual({ path: "siblings.0.grade", section: "family", message: "Enter the sibling grade / age, or remove this sibling." });
    expect(issues).toContainEqual({ path: "siblings.0.school", section: "family", message: "Enter the sibling school or not attending, or remove this sibling." });
  });
  it("identifies exact nested fields and removes their errors as values are corrected", () => {
    const packet = emptyApplicationPacket();
    let issues = applicationPacketFieldIssues(packet, "");
    expect(issues).toContainEqual({ path: "households.0.address.city", section: "family", message: "Enter the city." });
    expect(issues).toContainEqual({ path: "households.0.contacts.0.email", section: "family", message: "Enter the contact email." });
    packet.households[0]!.address.city = "Example City";
    packet.households[0]!.contacts[0]!.email = "invalid";
    issues = applicationPacketFieldIssues(packet, "");
    expect(issues.some(issue => issue.path === "households.0.address.city")).toBe(false);
    expect(issues.filter(issue => issue.path === "households.0.contacts.0.email")).toEqual([
      { path: "households.0.contacts.0.email", section: "family", message: "Enter a valid contact email" },
    ]);
  });
  it("rejects whitespace-only required fields in shared progress", () => {
    const packet = emptyApplicationPacket();
    packet.student.primaryLanguage = "   ";
    expect(applicationPacketFieldIssues(packet, "")).toContainEqual({
      path: "student.primaryLanguage", section: "student", message: "Enter the primary language.",
    });
  });
  it("does not silently hide a malformed persisted packet", () => {
    expect(() => readApplicationPacket({ applicationPacket: { version: 9 } })).toThrow();
  });
});
