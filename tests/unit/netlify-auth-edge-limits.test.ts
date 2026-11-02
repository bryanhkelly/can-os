import { describe, expect, it } from "vitest";
import requestPassThrough, {
  config as requestGuard,
} from "../../netlify/edge-functions/access-request-rate-limit";
import verificationPassThrough, {
  config as verificationGuard,
} from "../../netlify/edge-functions/access-verify-rate-limit";


describe("trusted Netlify edge authentication protection", () => {
 it("limits only the two credential POST routes, before hitting the application", () => {
  expect(requestGuard.path).toBe("/access/request");
  expect(verificationGuard.path).toBe("/access/verify");
  expect(requestGuard.method).toBe("POST");
  expect(verificationGuard.method).toBe("POST");
  expect(requestGuard.path).not.toBe(verificationGuard.path);
 });
 it("uses Netlify-resolved source IP and domain, never caller headers", () => {
  for (const guard of [requestGuard,verificationGuard]) {
   expect(guard.rateLimit.aggregateBy).toEqual(["ip","domain"]);
   expect(guard.rateLimit.windowSize).toBe(60);
   expect(guard.rateLimit.windowLimit).toBeGreaterThan(0);
   expect(JSON.stringify(guard)).not.toMatch(/forwarded|user-agent|cookie|email|token|header/i);
  }
 });
 it("has tighter per-IP budgets than the existing database-wide emergency ceilings", () => {
  expect(requestGuard.rateLimit.windowLimit).toBe(20);
  expect(verificationGuard.rateLimit.windowLimit).toBe(40);
  expect(requestGuard.rateLimit.windowLimit).toBeLessThan(240); // DB request ceiling
  expect(verificationGuard.rateLimit.windowLimit).toBeLessThan(600); // DB verification ceiling
 });
 it("does not consume or rewrite the request: all existing server auth gates remain in place", () => {
  expect(requestPassThrough()).toBeUndefined();
  expect(verificationPassThrough()).toBeUndefined();
 });
});
