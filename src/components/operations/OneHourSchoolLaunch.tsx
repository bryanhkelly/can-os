import { LaunchOrientationTask } from "@/components/operations/LaunchOrientationTask";
import { LaunchOpeningTask } from "@/components/operations/LaunchOpeningTask";
import { SchoolOwnedCompletion, LaunchEvidenceStatement, InstitutionalEvidenceReview } from "@/components/operations/LaunchRequirementActions";
import { LaunchTaskDestination } from "@/components/operations/LaunchTaskDestination";
import { useState } from "react";
import { resolveLaunchResume } from "@/domain/launch-resume";
import { Link, useRouter } from "@tanstack/react-router";
import { StatusBadge } from "@/components/workspace";
import {
  buildLaunchGuidance,
  launchOwnershipLabel,
  launchResponsibility,
  type LaunchGuidanceTask,
} from "@/domain/launch-guidance";
import { isExtendedLearningType } from "@/domain/program-offerings";
import { postLaunchOperationsDestination } from "@/domain/launch-operations-handoff";
import {
  activateLaunch,
  completeLaunchRequirement,
  submitLaunchEvidence,
  reviewLaunchEvidence,
  scheduleLaunchOrientation,
  type listLaunches,
} from "@/modules/programs/launch.functions";

type Launch = Awaited<ReturnType<typeof listLaunches>>["launches"][number];

function taskTone(task: LaunchGuidanceTask): "success" | "attention" | "neutral" {
  if (task.state === "complete") return "success";
  if (task.state === "needs_you" || task.state === "blocked") return "attention";
  return "neutral";
}



export function OneHourSchoolLaunch({ launches: allLaunches, selectedProgramId, selectedSiteId }: {
  launches: Launch[];
  selectedProgramId?: string;
  selectedSiteId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opened, setOpened] = useState<{ name: string; siteId: string | null } | null>(null);
  const { launches, launch, unavailable } = resolveLaunchResume(allLaunches, {
    siteId: selectedSiteId, programId: selectedProgramId,
  });
  const canReviewSelectedLaunch = launch?.canReviewEvidence === true;
  if (unavailable) return <section role="alert" className="mt-8 rounded-2xl border bg-card p-6">
    <h2 className="font-serif text-2xl">This launch is unavailable</h2>
    <p className="mt-3 text-sm">The requested Program is no longer in your pre-opening launch scope.
      It may have opened or your access may have changed.</p>
    <Link to="/operations" search={{ siteId: selectedSiteId, programId: selectedProgramId }}
      className="mt-4 inline-block font-semibold underline">Review the operating workspace →</Link>
    <Link to="/operations/launch" search={{ siteId: selectedSiteId, programId: undefined }}
      className="ml-4 mt-4 inline-block font-semibold underline">Choose an available launch →</Link>
  </section>;
  if (!launch && launches.length > 1) return <section className="mt-8 rounded-2xl border bg-card p-6">
    <h2 className="font-serif text-2xl">Choose the school to continue</h2>
    <p className="mt-3 text-sm">Each school resumes its own saved Program and Launch Journey.</p>
    <nav aria-label="Available school launches" className="mt-4 flex flex-wrap gap-3">
      {launches.map(item => <Link key={item.id} to="/operations/launch"
        search={{ siteId: item.siteId ?? undefined, programId: item.id }}
        className="min-h-11 rounded-xl border px-4 py-3 text-sm font-semibold">
        Continue {item.name}
      </Link>)}
    </nav>
  </section>;
  if (!launch) return <section className="mt-8 rounded-2xl border bg-card p-6" aria-label="Launch your school">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">School launch</p>
    <h2 className="mt-2 font-serif text-3xl">Let&apos;s open your school</h2>
    <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
      Start with a school name, church, and location. CAN will create the school Program and Launch Journey,
      then guide you through the remaining setup. Starting a launch never authorizes opening.
    </p>
    <a href="#new-school-launch" className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground">
      Launch a school
    </a>
  </section>;

  const guidance = buildLaunchGuidance(launch);
  const next = guidance.nextTask;
  async function run(operation: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await operation();
      try {
        await router.invalidate();
      } catch {
        setError("The action was saved, but launch progress could not refresh. Reopen this school before repeating the action.");
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save launch progress");
    } finally {
      setBusy(false);
    }
  }
  async function complete(requirementId: string) {
    await run(() => completeLaunchRequirement({ data: { journeyRequirementId: requirementId, confirmed: true } }));
  }
  async function submitEvidence(requirementId: string, statement: string): Promise<boolean> {
    setBusy(true);
    setError("");
    try {
      await submitLaunchEvidence({ data: { journeyRequirementId: requirementId, statement } });
      try { await router.invalidate(); } catch { setError("Evidence was saved but the launch could not refresh. Reopen before submitting again."); }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to submit evidence");
      return false;
    } finally {
      setBusy(false);
    }
  }
  async function reviewEvidence(requirementId: string, decision: "accepted" | "rejected", reason: string): Promise<boolean> {
    setBusy(true); setError("");
    try {
      await reviewLaunchEvidence({ data: { journeyRequirementId: requirementId, decision, reason } });
      try { await router.invalidate(); } catch { setError("Evidence decision was saved but the launch could not refresh. Reopen before retrying."); }
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to record evidence decision");
      return false;
    } finally { setBusy(false); }
  }
  async function saveOrientation(input: { title: string; startsAt: string; endsAt: string; timezone: string }) {
    await run(() => scheduleLaunchOrientation({ data: { programId: launch!.id, ...input } }));
  }
  async function open(recipientPersonId?: string) {
    await run(async () => {
      const activeLaunch = launch!;
      await activateLaunch({ data: { programId: activeLaunch.id, recipientPersonId } });
      // Navigation happens only after the canonical activation command returns.
      // The command alone decides readiness and opening authority.
      const href = postLaunchOperationsDestination({ programId: activeLaunch.id, siteId: activeLaunch.siteId });
      if (activeLaunch.siteId) {
        await router.navigate({ href });
        return;
      }
      setOpened({ name: activeLaunch.name, siteId: null });
    });
  }

  return <section className="mt-8 rounded-2xl border bg-card p-5 sm:p-7" aria-label="Guided school launch">
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Guided school launch</p>
    <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-serif text-3xl">Continue {launch.name}</h2>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Progress is saved to this Program and its Launch Journey after each recorded action.
          Return to this launch on another session or device; no browser checklist determines readiness.
        </p>
        {launch.targetOpeningDate && <p className="mt-2 text-sm">
          Target opening: {launch.targetOpeningDate} · planning date, not opening approval.
        </p>}
      </div>
      <StatusBadge tone={guidance.pendingBlocking.length ? "attention" : "neutral"}>
        {guidance.pendingBlocking.length
          ? `${guidance.pendingBlocking.length} blocking ${guidance.pendingBlocking.length === 1 ? "task" : "tasks"}`
          : guidance.ready ? "Journey ready" : "Review launch record"}
      </StatusBadge>
    </div>
    <section aria-label="School opening readiness" className="mt-5 rounded-xl border bg-background p-4">
      <h3 className="text-sm font-semibold">Opening authority</h3>
      <p className="mt-2 text-sm">
        {launch.status === "active"
          ? "Opening recorded: the canonical activation command completed. Continue daily readiness and operating checks in Site Today."
          : guidance.ready
            ? "Launch Journey ready for activation review. The school is not yet open; CAN OS must still verify current academic, staffing, institutional, and receiving-operator authority."
            : guidance.pendingBlocking.length > 0
              ? `Not authorized to open: ${guidance.pendingBlocking.length} blocking requirement${guidance.pendingBlocking.length === 1 ? "" : "s"} remain incomplete in the Launch Journey.`
              : "Opening not authorized: the Launch Journey has not reached ready status. Review the canonical launch record."}
      </p>
      {launch.status !== "active" && <p className="mt-2 text-xs text-muted-foreground">
        School setup, published pages, family invitations, accepted applications, and active enrollments do not independently authorize opening.
      </p>}
    </section>
    {launches.length > 1 && <label className="mt-4 block max-w-md text-sm">Resume a school launch
      <select value={launch.id} onChange={event => {
        const selected = launches.find(item => item.id === event.target.value);
        void router.navigate({
          to: "/operations/launch",
          search: { programId: event.target.value, siteId: selected?.siteId ?? undefined },
        });
      }} className="mt-1 block w-full rounded-lg border bg-background p-2">
        {launches.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
    </label>}
    {error && <p role="alert" className="mt-4 rounded-lg border border-destructive p-3 text-sm">{error}</p>}
    {launch.status === "active" && launch.siteId && <p role="status" className="mt-4 rounded-lg border p-4 text-sm">
      {launch.name} is active. Daily work now lives with the opening handoff, staffing, admissions and academic activity in Site Today.{" "}
      <Link to="/sites/$siteId" params={{ siteId: launch.siteId }} className="font-semibold underline">Open Site Today →</Link>
    </p>}
    {opened && <p role="status" className="mt-4 rounded-lg border p-4 text-sm">
      {opened.name} is active. {opened.siteId
        ? <Link to="/sites/$siteId" params={{ siteId: opened.siteId }} className="underline">
          Open Site Today to review the named operator handoff →
        </Link>
        : "Opening is recorded."}
    </p>}

    <p className="mt-4 text-sm text-muted-foreground" role="status">You can prepare your website and invite families while CAN reviews opening requirements. Invitations and setup do not activate enrollment or authorize a supervised school day.</p>
    <section aria-label="Launch milestone overview" className="mt-5">
      <h3 className="text-sm font-semibold">Your opening milestones</h3>
      <p className="mt-1 text-xs text-muted-foreground">These are guidance labels, not independent approvals. CAN's saved requirements and authorization services make the final decisions.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {([
          ["Configuration completed", "Review saved school setup", false],
          ["CAN services authorized", "Independent CAN authorization required", false],
          ["Safe to open", "Only canonical opening activation confirms this", launch.status === "active"],
          ["Family outreach sent", "Review actual invitation delivery records", false],
          ["First class ready", "Verify the real section and first-week prerequisites", false],
        ] as const).map(([label,description,confirmed]) => <div key={label} className="rounded-xl border bg-background p-3">
          <p className="text-sm font-semibold">{label}</p>
          <p className="mt-1 text-xs">{confirmed ? "Progress recorded" : "Not confirmed here"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{description}</p>
        </div>)}
      </div>
      <nav aria-label="Next school preparation actions" className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
        <a href="#launch-academic-year" className="underline">Prepare recommended year</a>
        <Link to="/operations/launch/$programId" params={{programId:launch.id}} search={{siteId:launch.siteId??undefined,programId:undefined}} className="underline">Review launch setup</Link>
        <a href="#launch-website" className="underline">Prepare website</a>
        <a href="#invite-families" className="underline">Review invitation progress</a>
      </nav>
    </section>
    {next ? <article className="mt-6 rounded-2xl border-2 border-primary/30 p-5" aria-label="Next launch task">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Next up</p>
          <h3 className="mt-1 font-serif text-2xl">{next.title}</h3>
        </div>
        <StatusBadge tone={taskTone(next)}>{launchOwnershipLabel(next.state)}</StatusBadge>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{next.description}</p>
      <p className="mt-2 text-xs font-semibold">Responsible: {launchResponsibility(next.state)}</p>
      {next.evidenceInstructions && <p className="mt-2 text-sm">Evidence requested: {next.evidenceInstructions}</p>}
      {Boolean(next.evidenceStatementCount) && <p className="mt-1 text-xs">Statements submitted: {next.evidenceStatementCount} · Recorded for review, not approved.</p>}
      {next.requirementId && <p className="mt-1 text-xs text-muted-foreground">Evidence entries: {next.evidenceCount ?? 0}</p>}
      {next.requiresRegistrarReview && <p className="mt-2 text-sm font-semibold">This requirement needs the registrar evidence-review workflow; it cannot be self-certified.</p>}
      {Boolean(next.rejectedReviewCount) && <p role="alert" className="mt-2 text-sm font-semibold">{next.latestReviewStatus === "rejected" ? "Latest evidence review was rejected; follow up through the registrar workflow." : `${next.rejectedReviewCount} historical rejection(s); latest review: ${next.latestReviewStatus ?? "unknown"}.`}</p>}
      {Boolean(next.reviewNoteCount) && <p className="mt-1 text-xs text-muted-foreground">{next.reviewNoteCount} registrar review note(s) on record.</p>}
      {next.evidenceReviewCorrectionPending && <p role="status" className="mt-2 text-sm font-semibold">Correction required before this evidence can be reviewed again.</p>}
      {next.pendingEvidenceReview && <p role="status" className="mt-2 text-sm font-semibold">Evidence submitted; awaiting a CAN institutional decision.</p>}
      {next.latestReviewStatus === "rejected" && next.latestReviewReason && <p className="mt-2 rounded-lg border p-3 text-sm">Correction requested: {next.latestReviewReason}</p>}
      
      {next.state === "needs_can" && <p className="mt-3 text-sm">
        CAN owns this work. Your school cannot mark it complete from this screen.
      </p>}
      {next.state === "waiting_third_party" && <p className="mt-3 text-sm">
        This depends on someone outside your school and CAN. Recorded waiting is not approval.
      </p>}
      <div className="mt-4"><LaunchTaskDestination launch={launch} task={next} /></div>
      {canReviewSelectedLaunch && next.pendingEvidenceReview && <InstitutionalEvidenceReview key={next.id} task={next} busy={busy} review={reviewEvidence} />}
      <LaunchEvidenceStatement key={next.id} task={next} busy={busy} submit={submitEvidence} />
      <SchoolOwnedCompletion key={next.id} task={next} busy={busy} complete={complete} />
      {next.action === "orientation" && next.state === "needs_you" &&
        <LaunchOrientationTask launch={launch} busy={busy} save={saveOrientation} />}
      {next.action === "opening" && next.state === "needs_you" &&
        <LaunchOpeningTask key={launch.id} launch={launch} busy={busy} open={open} />}
    </article> : <p role="status" className="mt-6 rounded-xl border p-4 text-sm">
      No further task is derived from the saved Launch Journey. Review the canonical record rather than assuming opening is approved.
    </p>}

    <details className="mt-5 rounded-xl border bg-background p-4">
      <summary className="cursor-pointer text-sm font-semibold">View the full saved launch path ({guidance.pendingBlocking.length} opening blockers, {guidance.pending.length} outstanding requirements)</summary>
      <ol className="mt-4 space-y-3">
        {guidance.tasks.map((task, index) => <li key={task.id} className="flex items-start justify-between gap-3 rounded-lg border p-3">
          <div>
            <p className="text-sm font-semibold">{index + 1}. {task.title}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {task.blocking && task.state !== "complete" ? "Blocking opening · " : ""}{task.description}
            </p>
            {task.evidenceInstructions && <p className="mt-1 text-xs">Evidence requested: {task.evidenceInstructions}</p>}
            
            {Boolean(task.evidenceStatementCount) && <p className="mt-1 text-xs">Statements submitted: {task.evidenceStatementCount} · Awaiting the relevant requirement decision.</p>}
            {task.requirementId && <p className="mt-1 text-xs text-muted-foreground">Evidence entries on record: {task.evidenceCount ?? 0}</p>}
            {task.requiresRegistrarReview && <p className="mt-1 text-xs font-semibold">Registrar evidence review required — school self-completion is unavailable.</p>}
            {Boolean(task.reviewNoteCount) && <p className="mt-1 text-xs text-muted-foreground">Registrar review notes: {task.reviewNoteCount}</p>}
            {task.latestReviewStatus === "rejected" && task.latestReviewReason && <p className="mt-1 text-xs">Latest correction request: {task.latestReviewReason}</p>}
            {Boolean(task.rejectedReviewCount) && <p className="mt-1 text-xs font-semibold text-destructive">Historical rejected review events: {task.rejectedReviewCount}. Latest review: {task.latestReviewStatus ?? "unknown"}.</p>}
            
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <StatusBadge tone={taskTone(task)}>{launchOwnershipLabel(task.state)}</StatusBadge>
            <span className="text-right text-xs font-medium">Responsible: {launchResponsibility(task.state)}</span>
            {task.state === "needs_can" && <span className="max-w-48 text-right text-xs text-muted-foreground">CAN must review and complete this requirement.</span>}
            {task.state === "waiting_third_party" && <span className="max-w-48 text-right text-xs text-muted-foreground">Awaiting an external party; this is not approval.</span>}
            {task.state === "needs_you" && <span className="max-w-48 text-right text-xs text-muted-foreground">School-owned work; confirm completion only after the underlying requirement is met.</span>}
            {task.state === "blocked" && <span className="max-w-48 text-right text-xs text-muted-foreground">Review the canonical requirement record to resolve the blocker.</span>}
            {task.state !== "complete" && task.action !== "opening" &&
              <LaunchTaskDestination launch={launch} task={task} />}
            {canReviewSelectedLaunch && task.id !== next?.id && task.pendingEvidenceReview && <InstitutionalEvidenceReview key={task.id} task={task} busy={busy} review={reviewEvidence} />}
            {task.id !== next?.id && (task.evidenceReviewCorrectionPending || (task.state === "needs_can" && !task.pendingEvidenceReview && !task.evidenceStatementCount)) && <LaunchEvidenceStatement key={task.id} task={task} busy={busy} submit={submitEvidence} />}
            {task.state !== "complete" && task.action === "orientation" &&
              <Link to="/operations/launch/$programId" params={{programId:launch.id}}
                search={{siteId:launch.siteId??undefined,programId:undefined}}
                className="text-xs font-semibold underline">Review orientation setup</Link>}
          </div>
        </li>)}
      </ol>
    </details>

    <section className="mt-5 rounded-xl border bg-background p-4" aria-label="Prepare your school community">
      <h3 className="text-sm font-semibold">Prepare your school community</h3>
      <p className="mt-3 text-sm text-muted-foreground">
        You can prepare these items while opening reviews continue. These tools do not replace opening requirements. A public website is not required for registrar-assisted intake.
      </p>
      <nav aria-label="Optional launch setup" className="mt-3 flex flex-wrap gap-3 text-sm font-semibold">
        {launch.siteId && <Link to="/sites/$siteId/publish" params={{ siteId: launch.siteId }} className="underline">
          Review private school website
        </Link>}
        {!isExtendedLearningType(launch.type) && <Link to="/admissions/intake"
          search={{ siteId: launch.siteId ?? undefined, programId: launch.id }} className="underline">
          Prepare family intake
        </Link>}
        <a href="#invite-families" className="underline">Invite families to apply</a>
        <Link to="/messages" className="underline">Other family communications</Link>
      </nav>
    </section>
  </section>;
}



