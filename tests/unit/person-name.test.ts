import { describe, expect, it } from "vitest";
import { personDisplayName, personLegalName, personShortName, type PersonName } from "@/domain/person-name";

describe("person-name formats", () => {
  it.each<{ person: PersonName; short: string; display: string; legal: string }>([
    { person: { preferredName: "Jo", legalFirstName: "Jordan", legalLastName: "Test" }, short: "Jo", display: "Jo Test", legal: "Jordan Test" },
    { person: { legalFirstName: "Jordan", legalLastName: "Test" }, short: "Jordan", display: "Jordan Test", legal: "Jordan Test" },
    { person: { preferredName: null, legalFirstName: "Jordan", legalLastName: "Test" }, short: "Jordan", display: "Jordan Test", legal: "Jordan Test" },
    { person: { preferredName: " \t ", legalFirstName: " Jordan ", legalLastName: " Test " }, short: "Jordan", display: "Jordan Test", legal: "Jordan Test" },
    { person: { preferredName: "  Jo \t Lee ", legalFirstName: " Jordan\nLee ", legalLastName: " van   Test " }, short: "Jo Lee", display: "Jo Lee van Test", legal: "Jordan Lee van Test" },
    { person: { legalLastName: "Test" }, short: "Test", display: "Test", legal: "Test" },
    { person: { legalFirstName: "Jordan" }, short: "Jordan", display: "Jordan", legal: "Jordan" },
    { person: { preferredName: "Jo" }, short: "Jo", display: "Jo", legal: "Unknown person" },
    { person: { preferredName: null, legalFirstName: null, legalLastName: null }, short: "Unknown person", display: "Unknown person", legal: "Unknown person" },
    { person: {}, short: "Unknown person", display: "Unknown person", legal: "Unknown person" },
    { person: { legalFirstName: "\t", legalLastName: "\n" }, short: "Unknown person", display: "Unknown person", legal: "Unknown person" },
    { person: { legalFirstName: "Anne-Marie", legalLastName: "O'Neil" }, short: "Anne-Marie", display: "Anne-Marie O'Neil", legal: "Anne-Marie O'Neil" },
  ])("formats $person explicitly", ({ person, short, display, legal }) => {
    expect(personShortName(person)).toBe(short);
    expect(personDisplayName(person)).toBe(display);
    expect(personLegalName(person)).toBe(legal);
  });

  it("supports contextual missing-name labels without inventing a legal identity", () => {
    expect(personShortName({}, "Student")).toBe("Student");
    expect(personDisplayName({}, "Student")).toBe("Student");
    expect(personLegalName({ preferredName: "Jo" }, "")).toBe("");
  });

  it("does not mutate source fields or normalize punctuation and case", () => {
    const person = Object.freeze({ preferredName: "  Jo ", legalFirstName: "Jordan", legalLastName: "de Test" });
    expect(personDisplayName(person)).toBe("Jo de Test");
    expect(person.preferredName).toBe("  Jo ");
  });
});
