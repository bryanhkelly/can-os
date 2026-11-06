import { describe, expect, it } from "vitest";
import { launchNavigationLosesInput } from "@/components/launch-studio/useLaunchUnsavedChanges";
import { studentDraftMatchesProfile, launchDraftValueSchema } from "@/domain/launch-draft";

describe("Launch Studio input protection", () => {
  const current = { pathname: "/launch/family", search: { application: "child", step: "application" } };
  it("allows step changes without discarding mounted input", () => {
    expect(launchNavigationLosesInput(current, { ...current, search: { step: "documents", application: "child" } })).toBe(false);
  });
  it("protects dashboard exits and changes of school or child", () => {
    expect(launchNavigationLosesInput(current, { pathname: "/home", search: {} })).toBe(true);
    expect(launchNavigationLosesInput(current, { ...current, search: { application: "different-child", step: "application" } })).toBe(true);
    expect(launchNavigationLosesInput({ pathname: "/launch/school", search: { siteId: "one" } },
      { pathname: "/launch/school", search: { siteId: "two" } })).toBe(true);
  });
  const fields = { preferredName: "Draft", pronouns: "", interests: "Art", courseIds: [],
    profileBaseline: { preferredName: "Saved", pronouns: "", interests: "" } };
  it("restores only drafts based on the current saved profile", () => {
    expect(studentDraftMatchesProfile(fields, { preferredName: "Saved", preferredPronouns: "", interests: [] })).toBe(true);
    expect(studentDraftMatchesProfile(fields, { preferredName: "Newer", preferredPronouns: "", interests: [] })).toBe(false);
    expect(studentDraftMatchesProfile({ ...fields, profileBaseline: undefined },
      { preferredName: "Saved", preferredPronouns: "", interests: [] })).toBe(false);
  });
  it("accepts legacy drafts but bounds and validates new profile baselines", () => {
    expect(launchDraftValueSchema.safeParse({ audience: "student", fields }).success).toBe(true);
    expect(launchDraftValueSchema.safeParse({ audience: "student", fields: { ...fields, profileBaseline: undefined } }).success).toBe(true);
    expect(launchDraftValueSchema.safeParse({ audience: "student", fields: { ...fields,
      profileBaseline: { ...fields.profileBaseline, preferredName: "a".repeat(81) } } }).success).toBe(false);
  });
});
