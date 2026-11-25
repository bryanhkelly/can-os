import { describe, expect, it } from "vitest";
import { normalizeIdentityDomain, identityEmailDomain, isDemoDomain, classifyOwnedData } from "@/domain/domain-classification";
import { isDemoAccountEmail } from "@/domain/local-demo-access";
import { isDemoSchoolDomain } from "@/domain/school-setup";
import { suppressDemoEmailDelivery } from "@/domain/email-delivery-policy";

describe("canonical identity domains", () => {
  it.each(["school.demo", "training.school.demo", "a.demo", "ab.demo", "a--b.demo"])(
    "recognizes %s consistently", domain => {
      expect(normalizeIdentityDomain(domain)).toBe(domain);
      expect(isDemoDomain(domain)).toBe(true);
      expect(isDemoSchoolDomain(domain)).toBe(true);
      expect(isDemoAccountEmail("person@" + domain)).toBe(true);
      expect(suppressDemoEmailDelivery("person@" + domain)).toBe(true);
    },
  );
  it.each(["school.org", "school.demo.org", "gmail.com"])(
    "does not classify %s as demo", domain => {
      expect(isDemoDomain(domain)).toBe(false);
      expect(isDemoAccountEmail("person@" + domain)).toBe(false);
      expect(suppressDemoEmailDelivery("person@" + domain)).toBe(false);
    },
  );
  it.each(["https://school.demo", "-school.demo", "school-.demo", "school..demo", "demo", "x".repeat(64) + ".demo"])(
    "rejects malformed domain %s", domain => {
      expect(normalizeIdentityDomain(domain)).toBeNull();
      expect(isDemoDomain(domain)).toBe(false);
    },
  );
  it("classifies operational data by its owner, preserving unknowns", () => {
    expect(classifyOwnedData("training.school.demo")).toBe("synthetic");
    expect(classifyOwnedData("school.org")).toBe("real");
    expect(classifyOwnedData(null)).toBe("unknown");
    expect(classifyOwnedData("https://school.org")).toBe("unknown");
  });
  it("normalizes contact evidence without deriving Person identity from an organization", () => {
    expect(identityEmailDomain(" PERSON@TRAINING.SCHOOL.DEMO ")).toBe("training.school.demo");
    expect(identityEmailDomain(null)).toBeNull();
    expect(identityEmailDomain("person@@school.demo")).toBeNull();
    expect(identityEmailDomain("person.demo@school.org")).toBe("school.org");
    expect(isDemoDomain("school.demo")).toBe(true);
    expect(isDemoDomain(identityEmailDomain("person@school.org"))).toBe(false);
  });
});
