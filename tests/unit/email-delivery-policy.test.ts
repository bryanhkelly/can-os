import { describe, expect, it } from "vitest";
import { suppressDemoEmailDelivery } from "@/domain/email-delivery-policy";

describe("outbound email destination policy", () => {
  it.each(["person@school.demo", " PERSON@SCHOOL.DEMO ", "person@nested.school.demo"])(
    "suppresses %s", email => expect(suppressDemoEmailDelivery(email)).toBe(true),
  );
  it.each(["person@school.org", "person.demo@school.org", "person@school.demo.org"])(
    "does not suppress %s", email => expect(suppressDemoEmailDelivery(email)).toBe(false),
  );
});
