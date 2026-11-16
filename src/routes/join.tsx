import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeFacilitatedPairingCode } from "@/domain/facilitated-learning";
import { classroomCodeFromFragment, displayClassroomCode } from "@/domain/classroom-connect";
import { getClassroomConnectCourseChoices } from "@/modules/learning/classroom-connect.functions";
import { pairWithFacilitatedRoom } from "@/modules/learning/facilitated-learning.functions";

export const Route = createFileRoute("/join")({
  head: () => ({ meta: [{ name: "referrer", content: "no-referrer" }] }),
  component: ClassroomJoinPage,
});
type Choices = Awaited<ReturnType<typeof getClassroomConnectCourseChoices>>;

/** The code stays in local component state, never the address bar or analytics URL. */
function ClassroomJoinPage() {
  const navigate = useNavigate();
  const [code, setCode] = useState("");
  const [choices, setChoices] = useState<Choices | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    // QR payloads arrive only in the fragment. Remove the fragment immediately
    // and remember it tab-locally across a one-time sign-in redirect. The code
    // remains an untrusted, short-lived pointer, NEVER an authentication token.
    const fromQr = classroomCodeFromFragment(window.location.hash);
    if (window.location.hash.startsWith("#pair=")) {
      window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    }
    if (fromQr) {
      setCode(displayClassroomCode(fromQr));
      try { window.sessionStorage.setItem("can-classroom-pending-pair-code", fromQr); } catch { /* manual entry remains available */ }
    } else {
      try {
        const pending = window.sessionStorage.getItem("can-classroom-pending-pair-code");
        if (pending) setCode(displayClassroomCode(pending));
      } catch { /* stale/invalid tab state is ignored */ }
    }
  }, []);
  useEffect(() => {
    let active = true;
    void getClassroomConnectCourseChoices()
      .then(result => { if (active) setChoices(result); })
      .catch(() => { if (active) setError("Sign in with your CAN account and an authorized Course registration to join this classroom."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);
  async function join(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    let normalized: string;
    try { normalized = normalizeFacilitatedPairingCode(code); }
    catch { setError("Enter the ten-character code displayed by your facilitator."); return; }
    const form = event.currentTarget;
    const selected = new FormData(form).get("courseAttemptId");
    if (typeof selected !== "string" || !choices?.choices.some(c => c.courseAttemptId === selected)) {
      setError("Select your enrolled Class or Course Attempt."); return;
    }
    setBusy(true); setError("");
    try {
      await pairWithFacilitatedRoom({ data: { courseAttemptId: selected, pairingCode: normalized } });
      setCode("");
      try { window.sessionStorage.removeItem("can-classroom-pending-pair-code"); } catch { /* no persistent code required */ }
      const chosen=choices.choices.find(choice=>choice.courseAttemptId===selected);
      if(chosen?.classId){
        // A native Class stays in the one shared Class workspace. The QR
        // code is only a pairing pointer, never an alternate learner route.
        void navigate({to:"/classes/$classId",params:{classId:chosen.classId},
          search:{view:"learn",tab:"sessions"},replace:true});
      }else{
        // Older school/noncredit courses retain their existing companion
        // until the coordinated non-native enrollment cutover.
        void navigate({to:"/classroom/companion",
          search:{courseAttemptId:selected},replace:true});
      }
    } catch {
      setError("Pairing refused. Check the code, expiry, enrollment, and current Site assignment.");
    } finally { setBusy(false); }
  }
  return <WorkspaceShell width="reading" eyebrow="Classroom Connect"
    title="Join a facilitator-led classroom"
    subtitle="Pair your device to a course you already participate in. Joining does not create enrollment or attendance.">
    <section className="mt-5 border border-border bg-card p-5">
      {loading && <p role="status">Checking your current courses…</p>}
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      {!loading && !choices && <Button asChild variant="outline">
        <Link to="/access" search={{returnTo:"/join"}}>Sign in to join</Link>
      </Button>}
      {!loading && choices && <form className="space-y-4" onSubmit={e => void join(e)}>
        <label htmlFor="classroom-pair-code" className="block text-sm font-medium">Facilitator code</label>
        <Input id="classroom-pair-code" autoComplete="off" autoCapitalize="characters"
          spellCheck={false} maxLength={11} placeholder="XXXXX-XXXXX" value={code}
          className="font-mono text-xl tracking-wider"
          onChange={e => setCode(e.target.value.toUpperCase())}/>
        <label htmlFor="classroom-course" className="block text-sm font-medium">Your enrolled Class or course</label>
        <select id="classroom-course" name="courseAttemptId" required
          className="w-full min-h-10 border border-border bg-background p-2 text-sm">
          <option value="">Choose an active course</option>
          {choices.choices.map(choice => <option key={choice.courseAttemptId}
            value={choice.courseAttemptId}>{choice.courseTitle}</option>)}
        </select>
        {!choices.choices.length && <div role="status"
          className="space-y-2 border border-border bg-muted/20 p-4 text-sm">
          <p>No currently enrolled Class or Course Attempt is eligible to pair.</p>
          <p className="text-muted-foreground">
            Check the authorized Class catalog for public self-registration.
            Private Classes require an invitation, approval, or an assignment
            from your organization. Scanning a QR code never enrolls you.
          </p>
          <Link to="/learn/classes" className="inline-block font-semibold underline">
            Explore available Classes
          </Link>
          <p className="text-xs text-muted-foreground">
            This tab retains the short-lived pairing code while you sign in or
            enroll. Return to Join after enrollment; expired codes must be renewed.
          </p>
        </div>}
        <Button disabled={busy || !choices.choices.length} type="submit">
          {busy ? "Pairing…" : "Pair my device"}
        </Button>
      </form>}
      <p className="mt-4 text-xs text-muted-foreground">
        After opening a QR link, the secret is removed from the address bar and
        kept only in this tab until pairing. Pairing is not verified attendance,
        time watched, a grade, a certificate, or a funding entitlement.
      </p>
    </section>
  </WorkspaceShell>;
}
