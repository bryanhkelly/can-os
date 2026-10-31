import { describe, expect, it } from "vitest";
import { eligibleNotificationEmailAccount } from "@/modules/communication/notification-email.server";

const eligible = {
  accountDisabled:false,
  emailVerifiedAt:new Date("2026-10-31T12:00:00Z"),
  grantActive:true,
  synthetic:false,
  personActive:true,
};

describe("notification email identity validation", () => {
  it("requires independently verified, active real account and person", () => {
    expect(eligibleNotificationEmailAccount(eligible)).toBe(true);
    for (const changes of [
      {accountDisabled:true},
      {emailVerifiedAt:null},
      {grantActive:false},
      {synthetic:true},
      {personActive:false},
    ]) {
      expect(eligibleNotificationEmailAccount({...eligible,...changes})).toBe(false);
    }
  });
});
