import { useEffect, useState } from "react";
import { mutationErrorMessage, useMutationFeedback } from "@/lib/mutation-feedback";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/choice";
import { WorkspaceNotice } from "@/components/workspace";
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
  return <section id="notification-preferences" className="mt-6  border bg-card p-4" aria-label="Notification preferences">
    <h2 className="text-lg font-semibold">Notification preferences</h2>
    <p className="mt-1 text-sm text-muted-foreground">Quiet hours defer email and SMS reminders, not in-app records.</p>
    {!loaded && !loadError && <p role="status">Loading delivery preferences...</p>}
    {loadError && <WorkspaceNotice tone="danger">{loadError} <Button type="button" variant="ghost" size="sm" className="underline" onClick={() => {
      void getMyNotificationPreferences().then(applyPreferences).catch(error =>
        setLoadError(mutationErrorMessage(error, "Unable to load delivery preferences.")));
    }}>Retry loading preferences</Button></WorkspaceNotice>}
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      <Label className="text-sm">Timezone (IANA)
        <Input disabled={busy} value={timezone} onChange={e => setTimezone(e.target.value)}
          className="mt-1 block w-full  border bg-background p-2" placeholder="America/Los_Angeles"/>
      </Label>
      <Label className="text-sm">Quiet from
        <Input disabled={busy} type="time" value={quietStart} onChange={e => setQuietStart(e.target.value)}
          className="mt-1 block w-full  border bg-background p-2"/>
      </Label>
      <Label className="text-sm">Quiet until
        <Input disabled={busy} type="time" value={quietEnd} onChange={e => setQuietEnd(e.target.value)}
          className="mt-1 block w-full  border bg-background p-2"/>
      </Label>
    </div>
    <Button disabled={busy} type="button" variant="outline" className="mt-3"
      onClick={() => void perform(() => saveMyQuietHours({ data: {
        timezone, quietStart: quietStart || null, quietEnd: quietEnd || null,
      }}), "Quiet hours saved.")}>Save quiet hours</Button>
    <div className="mt-5 border-t pt-4">
      <h3 className="font-semibold">SMS reminders</h3>
      {smsEnabled ? <>
        <p className="mt-2 text-sm">Verified and enabled for {phone}.</p>
        <Button disabled={busy} type="button" variant="outline" className="mt-2"
          onClick={() => void perform(async () => { await disableMySms(); setSmsEnabled(false); setConsent(false); }, "SMS disabled.")}>
          Revoke SMS consent
        </Button>
      </> : <>
        <p className="mt-1 text-sm text-muted-foreground">SMS is optional. Verify your number and explicitly agree before CAN sends reminders.</p>
        <Label className="mt-3 block text-sm">Phone number (+country code)
          <Input disabled={busy} value={phone} onChange={e => setPhone(e.target.value)} placeholder="+15551234567"
            className="mt-1 block w-full  border bg-background p-2"/>
        </Label>
        <Button disabled={busy} type="button" variant="outline" className="mt-2"
          onClick={() => void perform(() => requestMySmsVerification({ data: { phone } }), "Verification code requested.")}>
          Send verification code
        </Button>
        <Label className="mt-3 block text-sm">Verification code
          <Input disabled={busy} value={code} onChange={e => setCode(e.target.value)}
            className="mt-1 block w-full  border bg-background p-2"/>
        </Label>
        <Label className="mt-3 flex items-start gap-2 text-sm">
          <Checkbox disabled={busy} checked={consent} onChange={e => setConsent(e.target.checked)}/>
          I agree to receive CAN OS school assignment reminders by SMS. Message and data rates may apply; I can opt out in these settings.
        </Label>
        <Button disabled={busy || !consent} type="button" className="mt-3"
          onClick={() => void perform(async () => { await verifyMySmsConsent({ data: { phone, code, consent: true } }); setSmsEnabled(true); }, "SMS enabled.")}>
          Verify and enable SMS
        </Button>
      </>}
    </div>
    {feedback.notice && <p role="status" className="mt-3 text-sm">{feedback.notice}</p>}
    {feedback.error && <p role="alert" className="mt-3 text-sm">{feedback.error}</p>}
    {feedback.refreshFailed && <Button type="button" disabled={feedback.pending} variant="outline" className="mt-3"
      onClick={() => void feedback.retryRefresh()}>Refresh saved preferences</Button>}
  </section>;
}
