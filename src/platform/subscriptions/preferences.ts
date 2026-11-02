import { nextAllowedDelivery } from "@/domain/notification-quiet-hours";
export { nextAllowedDelivery } from "@/domain/notification-quiet-hours";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationPreferences } from "@/db/schema";
import { isDemoTenantOrganization } from "@/domain/local-demo-access";

const phonePattern = /^\+[1-9]\d{7,14}$/;
const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;

function auth() {
  const id = process.env.TWILIO_API_KEY ?? process.env.TWILIO_ACCOUNT_SID;
  const secret = process.env.TWILIO_API_SECRET ?? process.env.TWILIO_AUTH_TOKEN;
  if (!id || !secret) throw new Error("Twilio credentials not configured");
  return "Basic " + Buffer.from(id + ":" + secret).toString("base64");
}
function verifyUrl(suffix: string) {
  const sid = process.env.TWILIO_VERIFY_SERVICE_SID;
  if (!sid || !/^VA[0-9a-f]{32}$/i.test(sid)) throw new Error("Twilio Verify service is not configured");
  return "https://verify.twilio.com/v2/Services/" + sid + "/" + suffix;
}
async function twilioPost(url: string, payload: Record<string, string>) {
  const response = await fetch(url, {
    method: "POST",
    signal: AbortSignal.timeout(20_000),
    headers: { Authorization: auth(), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(payload),
  });
  if (!response.ok) throw new Error("Twilio request was rejected (" + response.status + ")");
  return await response.json() as Record<string, unknown>;
}
function assertSmsVerificationScope(organizationIds: readonly string[]) {
  if(!organizationIds.length || organizationIds.some(isDemoTenantOrganization))
    throw new Error("SMS verification is unavailable for this tenant scope");
}
export async function beginSmsVerification(personId: string, phone: string, organizationIds: readonly string[]): Promise<void> {
  assertSmsVerificationScope(organizationIds);
  if (!phonePattern.test(phone)) throw new Error("Phone must use E.164 format");
  // Claim a per-person cooldown before contacting the paid SMS provider.
  const now = new Date();
  await db.insert(notificationPreferences).values({ personId })
    .onConflictDoNothing();
  const rows = await db.update(notificationPreferences).set({
    smsVerificationRequestedAt: now, updatedAt: now,
  }).where(and(
    eq(notificationPreferences.personId, personId),
    or(
      isNull(notificationPreferences.smsVerificationRequestedAt),
      lte(notificationPreferences.smsVerificationRequestedAt, new Date(now.getTime() - 60_000)),
    ),
  )).returning({ id: notificationPreferences.id });
  if (!rows.length) throw new Error("SMS verification rate limit");
  await twilioPost(verifyUrl("Verifications"), { To: phone, Channel: "sms" });
}
export async function confirmSmsVerification(personId: string, phone: string, code: string, organizationIds: readonly string[]): Promise<void> {
  assertSmsVerificationScope(organizationIds);
  if (!phonePattern.test(phone) || !/^\d{4,10}$/.test(code)) throw new Error("Invalid phone or code");
  const result = await twilioPost(verifyUrl("VerificationCheck"), { To: phone, Code: code });
  if (result.status !== "approved") throw new Error("Verification failed");
  await db.insert(notificationPreferences).values({
    personId, smsVerifiedPhone: phone, smsVerifiedAt: new Date(),
    smsOptedIn: true, smsConsentAt: new Date(),
  }).onConflictDoUpdate({ target: notificationPreferences.personId, set: {
    smsVerifiedPhone: phone, smsVerifiedAt: new Date(),
    smsOptedIn: true, smsConsentAt: new Date(), updatedAt: new Date(),
  }});
}
export async function revokeSmsConsent(personId: string): Promise<void> {
  await db.update(notificationPreferences).set({
    smsOptedIn: false, smsConsentAt: null, updatedAt: new Date(),
  }).where(eq(notificationPreferences.personId, personId));
}
export async function updateQuietHours(personId: string, timezone: string, start: string | null, end: string | null) {
  try { new Intl.DateTimeFormat("en-US", { timeZone: timezone }).format(); }
  catch { throw new Error("Invalid timezone"); }
  if ((start === null) !== (end === null) || (start !== null && (!hhmm.test(start) || !hhmm.test(end!))))
    throw new Error("Quiet hours must be valid HH:mm pairs");
  await db.insert(notificationPreferences).values({ personId, timezone, quietStart: start, quietEnd: end })
    .onConflictDoUpdate({ target: notificationPreferences.personId, set: {
      timezone, quietStart: start, quietEnd: end, updatedAt: new Date(),
    }});
}
export async function sendOptedInSms(phone: string, message: string, organizationId: string | null): Promise<boolean> {
  if(!organizationId || isDemoTenantOrganization(organizationId)){
    console.log("[sms] External delivery suppressed for tenant scope");
    return false;
  }
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const sender = process.env.TWILIO_MESSAGING_SERVICE_SID ?? process.env.TWILIO_FROM_NUMBER;
  if (!sid || !sender || !phonePattern.test(phone)) return false;
  try {
    const payload: Record<string, string> = { To: phone, Body: message };
    if (sender.startsWith("MG")) payload.MessagingServiceSid = sender;
    else payload.From = sender;
    const result = await twilioPost("https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json", payload);
    return typeof result.sid === "string";
  } catch { return false; }
}
export async function getNotificationPreferences(personId: string) {
  const [prefs] = await db.select().from(notificationPreferences).where(eq(notificationPreferences.personId, personId)).limit(1);
  return prefs ?? null;
}
