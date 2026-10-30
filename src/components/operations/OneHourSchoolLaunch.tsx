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
  scheduleLaunchOrientation,
  type listLaunches,
} from "@/modules/programs/launch.functions";

type Launch = Awaited<ReturnType<typeof listLaunches>>["launches"][number];

function taskTone(task: LaunchGuidanceTask): "success" | "attention" | "neutral" {
  if (task.state === "complete") return "success";
  if (task.state === "needs_you" || task.state === "blocked") return "attention";
  return "neutral";
}

function TaskDestination({ launch, task }: { launch: Launch; task: LaunchGuidanceTask }) {
  if (task.action === "academics" || task.action === "review") {
    return <Link to="/operations/launch/$programId" params={{ programId: launch.id }}
      search={{ siteId: launch.siteId ?? undefined, programId: undefined }}
      className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
      Open guided setup
    </Link>;
  }
  if (task.action === "admissions") {
    return <Link to="/admissions/intake" search={{ siteId: launch.siteId ?? undefined, programId: launch.id }}
      className="inline-flex min-h-11 items-center rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground">
      Open family intake
    </Link>;
  }
  return null;
}

function SchoolOwnedCompletion({ task, busy, complete }: {
  task: LaunchGuidanceTask;
  busy: boolean;
  complete: (requirementId: string) => Promise<void>;
}) {
  const [confirmed, setConfirmed] = useState(false);
  if (!task.requirementId || task.state !== "needs_you") return null;
  return <details className="mt-4 rounded-xl border bg-background p-4">
    <summary className="cursor-pointer text-sm font-semibold">Record this school-owned requirement</summary>
    <p className="mt-3 text-sm text-muted-foreground">
      Use this only after the actual work is complete. This cannot complete CAN or third-party work,
      approve evidence, or authorize opening.
    </p>
    <label className="mt-3 flex items-start gap-2 text-sm">
      <input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
      I confirm the school-owned work is complete and accurately represented.
    </label>
    <button type="button" disabled={busy || !confirmed} onClick={() => void complete(task.requirementId!)}
      className="mt-3 min-h-11 rounded-xl border px-4 py-2 text-sm font-semibold disabled:opacity-50">
      Save school completion
    </button>
  </details>;
}

function localDateTime(date: Date) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function OrientationTask({ launch, busy, save }: {
  launch: Launch;
  busy: boolean;
  save: (input: { title: string; startsAt: string; endsAt: string; timezone: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState("Student and family orientation");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const timezone = launch.siteTimezone ?? "America/Los_Angeles";
  function useRecommendation() {
    const start = new Date();
    start.setDate(start.getDate() + 7);
    start.setHours(18, 0, 0, 0);
    const end = new Date(start.getTime() + 45 * 60_000);
    setStartsAt(localDateTime(start));
    setEndsAt(localDateTime(end));
  }
  return <form className="mt-4 rounded-xl border bg-background p-4" onSubmit={event => {
    event.preventDefault();
    if (!startsAt || !endsAt) return;
    void save({
      title,
      startsAt: new Date(startsAt).toISOString(),
      endsAt: new Date(endsAt).toISOString(),
      timezone,
    });
  }}>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-semibold">Schedule the canonical orientation event</p>
      <button type="button" onClick={useRecommendation} className="text-sm font-semibold underline">
        Use a suggested 45-minute time
      </button>
    </div>
    <p className="mt-2 text-xs text-muted-foreground">
      The suggestion only fills this form. Saving uses the existing orientation command and the Site timezone ({timezone}).
    </p>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <label className="text-sm sm:col-span-2">Title
        <input required value={title} onChange={event => setTitle(event.target.value)}
          className="mt-1 block w-full rounded-lg border bg-card p-2" />
      </label>
      <label className="text-sm">Start
        <input aria-label="Orientation start" required type="datetime-local" value={startsAt}
          onChange={event => setStartsAt(event.target.value)} className="mt-1 block w-full rounded-lg border bg-card p-2" />
      </label>
      <label className="text-sm">End
        <input aria-label="Orientation end" required type="datetime-local" value={endsAt}
          onChange={event => setEndsAt(event.target.value)} className="mt-1 block w-full rounded-lg border bg-card p-2" />
      </label>
    </div>
    <button type="submit" disabled={busy || !startsAt || !endsAt}
      className="mt-4 min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
      Save orientation
    </button>
  </form>;
}

function OpeningTask({ launch, busy, open }: {
  launch: Launch;
  busy: boolean;
  open: (recipientPersonId?: string) => Promise<void>;
}) {
  const [recipient, setRecipient] = useState("");
  return <div className="mt-4 rounded-xl border border-warning/40 bg-background p-4">
    {launch.siteId && <label className="block text-sm">Receiving site operator (required)
      <select aria-label={`Receiving site operator for ${launch.name}`} value={recipient}
        onChange={event => setRecipient(event.target.value)}
        className="mt-1 block w-full rounded-lg border bg-card p-2 text-sm">
        <option value="">Select the named receiving operator</option>
        {launch.openingOperators.map(operator => <option key={operator.personId} value={operator.personId}>
          {operator.firstName} {operator.lastName}
        </option>)}
      </select>
      <span className="mt-2 block text-xs text-muted-foreground">
        Only the selected active site registrar/operator can acknowledge receipt after opening.
        This does not waive readiness checks.
      </span>
      {!launch.openingOperators.length && <span role="alert" className="mt-2 block text-xs">
        No active site registrar/operator is available. An existing authorized site grant is required.
      </span>}
    </label>}
    <button type="button" disabled={busy || Boolean(launch.siteId && !recipient)}
      onClick={() => void open(recipient || undefined)}
      className="mt-4 min-h-11 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-50">
      Activate
    </button>
    <p className="mt-2 text-xs text-muted-foreground">
      Activation is not self-certified: the server rechecks the ready Journey and all current opening authority.
    </p>
  </div>;
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
      await router.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to save launch progress");
    } finally {
      setBusy(false);
    }
  }
  async function complete(requirementId: string) {
    await run(() => completeLaunchRequirement({ data: { journeyRequirementId: requirementId, confirmed: true } }));
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
      {next.requirementId && <p className="mt-1 text-xs text-muted-foreground">Saved requirement: <code className="select-all">{next.requirementId}</code></p>}
      {next.state === "needs_can" && <p className="mt-3 text-sm">
        CAN owns this work. Your school cannot mark it complete from this screen.
      </p>}
      {next.state === "waiting_third_party" && <p className="mt-3 text-sm">
        This depends on someone outside your school and CAN. Recorded waiting is not approval.
      </p>}
      <div className="mt-4"><TaskDestination launch={launch} task={next} /></div>
      <SchoolOwnedCompletion key={next.id} task={next} busy={busy} complete={complete} />
      {next.action === "orientation" && next.state === "needs_you" &&
        <OrientationTask launch={launch} busy={busy} save={saveOrientation} />}
      {next.action === "opening" && next.state === "needs_you" &&
        <OpeningTask key={launch.id} launch={launch} busy={busy} open={open} />}
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
            {task.requirementId && <p className="mt-1 text-xs text-muted-foreground">Requirement reference: <code className="select-all">{task.requirementId}</code></p>}
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <StatusBadge tone={taskTone(task)}>{launchOwnershipLabel(task.state)}</StatusBadge>
            <span className="text-right text-xs font-medium">Responsible: {launchResponsibility(task.state)}</span>
            {task.state === "needs_can" && <span className="max-w-48 text-right text-xs text-muted-foreground">CAN must review and complete this requirement.</span>}
            {task.state === "waiting_third_party" && <span className="max-w-48 text-right text-xs text-muted-foreground">Awaiting an external party; this is not approval.</span>}
            {task.state === "needs_you" && <span className="max-w-48 text-right text-xs text-muted-foreground">School-owned work; confirm completion only after the underlying requirement is met.</span>}
            {task.state === "blocked" && <span className="max-w-48 text-right text-xs text-muted-foreground">Review the canonical requirement record to resolve the blocker.</span>}
            {task.state !== "complete" && task.action !== "opening" &&
              <TaskDestination launch={launch} task={task} />}
            {task.state !== "complete" && task.action === "orientation" &&
              <Link to="/operations/launch/$programId" params={{programId:launch.id}}
                search={{siteId:launch.siteId??undefined,programId:undefined}}
                className="text-xs font-semibold underline">Review orientation setup</Link>}
          </div>
        </li>)}
      </ol>
    </details>

    <details className="mt-4 rounded-xl border bg-background p-4">
      <summary className="cursor-pointer text-sm font-semibold">Optional · Website, outreach and family intake</summary>
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
    </details>
  </section>;
}



