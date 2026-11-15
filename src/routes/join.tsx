import { useEffect, useState, type FormEvent } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { normalizeFacilitatedPairingCode } from "@/domain/facilitated-learning";
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
    let active = true;
    void getClassroomConnectCourseChoices()
      .then(result => { if (active) setChoices(result); })
      .catch(() => { if (active) setError("Sign in as an enrolled learner to join a facilitated course. This feature may not yet be enabled."); })
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
      setError("Select an eligible course."); return;
    }
    setBusy(true); setError("");
    try {
      await pairWithFacilitatedRoom({ data: { courseAttemptId: selected, pairingCode: normalized } });
      setCode("");
      void navigate({ to: "/classroom/companion", search: { courseAttemptId: selected }, replace: true });
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
      {!loading && choices && <form className="space-y-4" onSubmit={e => void join(e)}>
        <label htmlFor="classroom-pair-code" className="block text-sm font-medium">Facilitator code</label>
        <Input id="classroom-pair-code" autoComplete="off" autoCapitalize="characters"
          spellCheck={false} maxLength={11} placeholder="XXXXX-XXXXX" value={code}
          className="font-mono text-xl tracking-wider"
          onChange={e => setCode(e.target.value.toUpperCase())}/>
        <label htmlFor="classroom-course" className="block text-sm font-medium">Your course</label>
        <select id="classroom-course" name="courseAttemptId" required
          className="w-full min-h-10 border border-border bg-background p-2 text-sm">
          <option value="">Choose an active course</option>
          {choices.choices.map(choice => <option key={choice.courseAttemptId}
            value={choice.courseAttemptId}>{choice.courseTitle}</option>)}
        </select>
        {!choices.choices.length && <p role="status" className="text-sm text-muted-foreground">
          No eligible courses were found for this account. Check your registration.
        </p>}
        <Button disabled={busy || !choices.choices.length} type="submit">
          {busy ? "Pairing…" : "Pair my device"}
        </Button>
      </form>}
      <p className="mt-4 text-xs text-muted-foreground">
        Your code is not saved in the page URL. Pairing is not verified attendance,
        time watched, a grade, a certificate, or a funding entitlement.
      </p>
    </section>
  </WorkspaceShell>;
}
