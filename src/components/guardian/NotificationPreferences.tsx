import { useEffect, useState } from "react";
import {
  getMyNotificationPreferences, saveMyQuietHours, requestMySmsVerification,
  verifyMySmsConsent, disableMySms,
} from "@/modules/conversation/ask-can.functions";

/** Personal delivery controls. SMS is disabled until a verified explicit opt-in. */
export function NotificationPreferences() {
  const [timezone, setTimezone] = useState("UTC");
  const [quietStart, setQuietStart] = useState("");
  const [quietEnd, setQuietEnd] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [consent, setConsent] = useState(false);
  const [smsEnabled, setSmsEnabled] = useState(false);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let active = true;
    getMyNotificationPreferences().then(p => {
      if (!active) return;
      setTimezone(p.timezone); setQuietStart(p.quietStart ?? "");
      setQuietEnd(p.quietEnd ?? ""); setPhone(p.smsVerifiedPhone ?? "");
      setSmsEnabled(p.smsOptedIn);
    }).catch(() => { if (active) setStatus("Unable to load delivery preferences."); });
    return () => { active = false; };
  }, []);

  async function perform(job: () => Promise<unknown>, success: string) {
    setBusy(true); setStatus("");
    try { await job(); setStatus(success); }
    catch { setStatus("Request unsuccessful. Check settings or contact school support."); }
    finally { setBusy(false); }
  }
  return <section className="mt-6 rounded-xl border bg-card p-4" aria-label="Notification preferences">
    <h2 className="text-lg font-semibold">Notification preferences</h2>
    <p className="mt-1 text-sm text-muted-foreground">Quiet hours defer email and SMS reminders, not in-app records.</p>
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <label className="text-sm">Timezone (IANA)
        <input value={timezone} onChange={e => setTimezone(e.target.value)}
          className="mt-1 block w-full rounded-md border bg-background p-2" placeholder="America/Los_Angeles"/>
      </label>
      <label className="text-sm">Quiet from
        <input type="time" value={quietStart} onChange={e => setQuietStart(e.target.value)}
          className="mt-1 block w-full rounded-md border bg-background p-2"/>
      </label>
      <label className="text-sm">Quiet until
        <input type="time" value={quietEnd} onChange={e => setQuietEnd(e.target.value)}
          className="mt-1 block w-full rounded-md border bg-background p-2"/>
      </label>
    </div>
    <button disabled={busy} type="button" className="mt-3 rounded-full border px-4 py-2 text-sm"
      onClick={() => void perform(() => saveMyQuietHours({ data: {
        timezone, quietStart: quietStart || null, quietEnd: quietEnd || null,
      }}), "Quiet hours saved.")}>Save quiet hours</button>
    <div className="mt-5 border-t pt-4">
      <h3 className="font-semibold">SMS reminders</h3>
      {smsEnabled ? <>
        <p className="mt-2 text-sm">Verified and enabled for {phone}.</p>
        <button disabled={busy} type="button" className="mt-2 rounded-full border px-4 py-2 text-sm"
          onClick={() => void perform(async () => { await disableMySms(); setSmsEnabled(false); setConsent(false); }, "SMS disabled.")}>
          Revoke SMS consent
        </button>
      </> : <>
        <p className="mt-1 text-sm text-muted-foreground">SMS is optional. Verify your number and explicitly agree before CAN sends reminders.</p>
        <label className="mt-3 block text-sm">Phone number (+country code)
          <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15551234567"
            className="mt-1 block w-full rounded-md border bg-background p-2"/>
        </label>
        <button disabled={busy} type="button" className="mt-2 rounded-full border px-4 py-2 text-sm"
          onClick={() => void perform(() => requestMySmsVerification({ data: { phone } }), "Verification code requested.")}>
          Send verification code
        </button>
        <label className="mt-3 block text-sm">Verification code
          <input value={code} onChange={e => setCode(e.target.value)}
            className="mt-1 block w-full rounded-md border bg-background p-2"/>
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>
          I agree to receive CAN OS school assignment reminders by SMS. Message and data rates may apply; I can opt out in these settings.
        </label>
        <button disabled={busy || !consent} type="button" className="mt-3 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          onClick={() => void perform(async () => { await verifyMySmsConsent({ data: { phone, code, consent: true } }); setSmsEnabled(true); }, "SMS enabled.")}>
          Verify and enable SMS
        </button>
      </>}
    </div>
    <p role="status" className="mt-3 text-xs text-muted-foreground">{status}</p>
  </section>;
}
