import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import {readEmailConfiguration} from "@/modules/communication/email-configuration.server";

beforeEach(()=>{
 for(const key of ["CAN_ACCESS_FROM_EMAIL","CAN_NOTIFICATIONS_FROM_EMAIL","CAN_CAMPAIGN_FROM_EMAIL","CAN_CAMPAIGN_POSTAL_ADDRESS","RESEND_API_KEY","RESEND_WEBHOOK_SECRET","CAN_ACCESS_PUBLIC_ORIGIN"])vi.stubEnv(key,"");
 vi.stubEnv("RESEND_API_KEY","test-provider");
 vi.stubEnv("CAN_ACCESS_FROM_EMAIL","access@example.org");
});
afterEach(()=>vi.unstubAllEnvs());
describe("shared email configuration",()=>{
 it("shares provider credentials and preserves notification fallback",()=>{
  expect(readEmailConfiguration("access").apiKey).toBe("test-provider");
  expect(readEmailConfiguration("notification").from).toBe("access@example.org");
  expect(readEmailConfiguration("campaign").apiKey).toBe("test-provider");
 });
 it("does not silently authorize marketing from a transactional identity",()=>{
  expect(readEmailConfiguration("campaign").from).toBeUndefined();
  vi.stubEnv("CAN_CAMPAIGN_FROM_EMAIL","campaign@example.org");
  expect(readEmailConfiguration("campaign").from).toBe("campaign@example.org");
 });
 it("rejects multiline sender values",()=>{
  vi.stubEnv("CAN_CAMPAIGN_FROM_EMAIL","campaign@example.org\r\nBcc: other@example.org");
  expect(readEmailConfiguration("campaign").from).toBeUndefined();
 });
});
