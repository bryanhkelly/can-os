import { useEffect, useState } from "react";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
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
  const [loadError, setLoadError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const feedback = useMutationFeedback(async () => {
    const prefs = await getMyNotificationPreferences();
    setSmsEnabled(prefs.smsOptedIn);
    return prefs;
  });
  const busy = !loaded || feedback.pending || feedback.refreshFailed;
  function applyPreferences(p: Awaited<ReturnType<typeof getMyNotificationPreferences>>) {
    setTimezone(p.timezone); setQuietStart(p.quietStart ?? "");
    setQuietEnd(p.quietEnd ?? ""); setPhone(p.smsVerifiedPhone ?? "");
    setSmsEnabled(p.smsOptedIn); setLoadError(""); setLoaded(true);
  }
  useEffect(() => {
    let active = true;
    getMyNotificationPreferences().then(p => {
      if (!active) return;
      applyPreferences(p);
    }).catch(error => { if (active) setLoadError(mutationErrorMessage(error, "Unable to load delivery preferences.")); });
    return () => { active = false; };
  }, []);

  async function perform(job: () => Promise<unknown>, success: string) {
    await feedback.run(job, { successMessage: success,
      commandErrorMessage: "Request unsuccessful. Check settings or contact school support." });
  }
  return <section id="notification-preferences" className="mt-6 rounded-xl border bg-card p-4" aria-label="Notification preferences">
    <h2 className="text-lg font-semibold">Notification preferences</h2>
    <p className="mt-1 text-sm text-muted-foreground">Quiet hours defer email and SMS reminders, not in-app records.</p>
    {!loaded && !loadError && <p role="status">Loading delivery preferences...</p>}
    {loadError && <p role="alert">{loadError} <button type="button" className="underline" onClick={() => {
      void getMyNotificationPreferences().then(applyPreferences).catch(error =>
        setLoadError(mutationErrorMessage(error, "Unable to load delivery preferences.")));
    }}>Retry loading preferences</button></p>}
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <label className="text-sm">Timezone (IANA)
        <input disabled={busy} value={timezone} onChange={e => setTimezone(e.target.value)}
          className="mt-1 block w-full rounded-md border bg-background p-2" placeholder="America/Los_Angeles"/>
      </label>
      <label className="text-sm">Quiet from
        <input disabled={busy} type="time" value={quietStart} onChange={e => setQuietStart(e.target.value)}
          className="mt-1 block w-full rounded-md border bg-background p-2"/>
      </label>
      <label className="text-sm">Quiet until
        <input disabled={busy} type="time" value={quietEnd} onChange={e => setQuietEnd(e.target.value)}
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
          <input disabled={busy} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15551234567"
            className="mt-1 block w-full rounded-md border bg-background p-2"/>
        </label>
        <button disabled={busy} type="button" className="mt-2 rounded-full border px-4 py-2 text-sm"
          onClick={() => void perform(() => requestMySmsVerification({ data: { phone } }), "Verification code requested.")}>
          Send verification code
        </button>
        <label className="mt-3 block text-sm">Verification code
          <input disabled={busy} value={code} onChange={e => setCode(e.target.value)}
            className="mt-1 block w-full rounded-md border bg-background p-2"/>
        </label>
        <label className="mt-3 flex items-start gap-2 text-sm">
          <input disabled={busy} type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)}/>
          I agree to receive CAN OS school assignment reminders by SMS. Message and data rates may apply; I can opt out in these settings.
        </label>
        <button disabled={busy || !consent} type="button" className="mt-3 rounded-full bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50"
          onClick={() => void perform(async () => { await verifyMySmsConsent({ data: { phone, code, consent: true } }); setSmsEnabled(true); }, "SMS enabled.")}>
          Verify and enable SMS
        </button>
      </>}
    </div>
    {feedback.notice && <p role="status" className="mt-3 text-sm">{feedback.notice}</p>}
    {feedback.error && <p role="alert" className="mt-3 text-sm">{feedback.error}</p>}
    {feedback.refreshFailed && <button type="button" disabled={feedback.pending} className="mt-3 rounded-full border px-4 py-2 text-sm"
      onClick={() => void feedback.retryRefresh()}>Refresh saved preferences</button>}
  </section>;
}
