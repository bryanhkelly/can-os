import { useEffect, useMemo, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/shell/WorkspaceShell";
import { useActorProfile, useProgramLauncher } from "@/lib/program-launcher";
import {
  addOrientationToProgramJourney,
  completeJourneyRequirement,
  createChurchSchoolSite,
  createLaunchProgram,
  createLocalChurchSchoolSite,
  getSchoolYearStudio,
  listLaunchJourneys,
  selectOpeningHandoffRecipient,
  startProgramJourney,
} from "@/modules/programs/launch.functions";
import { markAcademicProgramLive } from "@/modules/programs/launch-academics.functions";
import { activateProgram } from "@/modules/operations/school-opening.server";

export const Route = createFileRoute("/operations/launch/")({
  component: OperationsLaunchPage,
});

type Launch = Awaited<ReturnType<typeof listLaunchJourneys>>["launches"][number];

const GRADE_ORDER = ["TK","K","1","2","3","4","5","6","7","8","9","10","11","12"] as const;

const inputClass =
  "mt-1 w-full rounded-lg border bg-background p-2 text-sm";
const selectClass =
  "mt-1 w-full rounded-lg border bg-background p-2 text-sm";

function OperationsLaunchPage() {
  const { actor, loading, error, isRegistrar } = useProgramLauncher();
  const [launches, setLaunches] = useState<{ launches: Launch[] } | null>(null);
  const [orientationFor, setOrientationFor] = useState("");
  const [orientationTitle, setOrientationTitle] = useState("Family orientation");
  const [orientationStart, setOrientationStart] = useState("");
  const [orientationEnd, setOrientationEnd] = useState("");
  const [openingRecipients, setOpeningRecipients] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [formError, setFormError] = useState("");

  const refresh = async () => {
    try {
      setLaunches(await listLaunchJourneys());
    } catch {
      setLaunches({ launches: [] });
    }
  };

  useEffect(() => {
    if (isRegistrar) void refresh();
  }, [isRegistrar]);

  const markComplete = async (programId: string, requirementId: string) => {
    setBusy(true);
    try {
      await completeJourneyRequirement({ data: { journeyId: requirementId } });
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const activate = async (programId: string) => {
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      await markAcademicProgramLive({ data: { programId } });
      const recipient = openingRecipients[programId];
      if (recipient) {
        await selectOpeningHandoffRecipient({ data: { programId, recipientPersonId: recipient } });
      }
      await activateProgram({ data: { programId } });
      setNotice("Program activated.");
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to activate program");
    } finally {
      setBusy(false);
    }
  };

  const addOrientation = async (programId: string) => {
    if (!orientationStart || !orientationEnd) return;
    setBusy(true);
    setFormError("");
    setNotice("");
    try {
      await addOrientationToProgramJourney({ data: {
        programId,
        title: orientationTitle,
        startsAt: orientationStart,
        endsAt: orientationEnd,
      } });
      setOrientationFor("");
      setNotice("Family orientation added to the launch journey.");
      await refresh();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Unable to schedule orientation");
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-background px-6 py-10 text-foreground">
        <p role="status" className="text-sm">Loading launch workspace…</p>
      </main>
    );
  }

  if (!isRegistrar) {
    return (
      <main className="min-h-screen bg-background px-6 py-10 text-foreground">
        <p role="alert" className="rounded-lg border p-4 text-sm">
          {error || "Sign in with an authorized registrar account to launch programs."}
        </p>
      </main>
    );
  }

  return (
    <WorkspaceShell
      eyebrow="CAN OS · Operations"
      title="Program launch"
      lede="Start a school launch, provision its first class, and track the requirements to activation."
    >
      {notice && <p role="status" className="rounded-lg border p-3 text-sm">{notice}</p>}
      {formError && <p role="alert" className="mt-4 rounded-lg border p-3 text-sm">{formError}</p>}

      <LaunchWizard
        actor={actor}
        busy={busy}
        setBusy={setBusy}
        setNotice={setNotice}
        setFormError={setFormError}
        onCreated={refresh}
      />

      <section className="mt-8">
        <h2 className="text-lg font-bold">Launches in progress</h2>
        <div className="mt-4 grid gap-4">
          {launches?.launches.map((launch) => {
            const blockingIncomplete = launch.requirements.filter(
              (requirement) => requirement.blocking && requirement.status !== "complete",
            );
            const activatable = launch.journey && blockingIncomplete.length === 0;
            return (
              <article key={launch.id} className="rounded-xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-semibold">{launch.name}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {launch.siteName ?? "No site yet"} · {launch.status}
                    </p>
                  </div>
                  <span className="rounded-full border px-3 py-1 text-xs">
                    {launch.requirements.filter((r) => r.status === "complete").length}/{launch.requirements.length} complete
                  </span>
                </div>
                <ul className="mt-4 space-y-2">
                  {launch.requirements.map((requirement) => (
                    <li key={requirement.id} className="flex items-center justify-between gap-3 text-sm">
                      <span>
                        {requirement.title}
                        {requirement.blocking && <span className="ml-2 text-xs text-muted-foreground">(blocking)</span>}
                      </span>
                      {requirement.status !== "complete" && (
                        <button
                          type="button"
                          className="rounded border px-3 py-1 text-xs disabled:opacity-50"
                          disabled={busy}
                          onClick={() => markComplete(launch.id, requirement.id)}
                        >
                          Complete
                        </button>
                      )}
                    </li>
                  ))}
                  {!launch.requirements.length && (
                    <li className="text-xs text-muted-foreground">No launch requirements configured.</li>
                  )}
                </ul>
                <div className="mt-4 rounded-lg border p-3">
                  <button type="button" onClick={()=>setOrientationFor(orientationFor===launch.id?"":launch.id)}
                    className="text-xs font-semibold underline">Schedule family orientation</button>
                  {orientationFor===launch.id && <div className="mt-3 grid gap-2">
                    <label className="text-xs">Title<input className={inputClass} value={orientationTitle} onChange={e=>setOrientationTitle(e.target.value)}/></label>
                    <label className="text-xs">Start<input type="datetime-local" className={inputClass} value={orientationStart} onChange={e=>setOrientationStart(e.target.value)}/></label>
                    <label className="text-xs">End<input type="datetime-local" className={inputClass} value={orientationEnd} onChange={e=>setOrientationEnd(e.target.value)}/></label>
                    <p className="text-xs text-muted-foreground">Times are entered in your local browser timezone and saved with an explicit offset.</p>
                    <button type="button" disabled={busy||!orientationStart||!orientationEnd}
                      onClick={()=>addOrientation(launch.id)} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Save orientation</button>
                  </div>}
                </div>
                <div className="mt-4">
                  {launch.siteId&&<label className="mb-3 block text-sm">Receiving site operator (required)
                    <select aria-label={"Receiving site operator for "+launch.name} value={openingRecipients[launch.id]??""}
                      onChange={event=>setOpeningRecipients(current=>({...current,[launch.id]:event.target.value}))}
                      className={selectClass}>
                      <option value="">Select the named receiving operator</option>
                      {launch.openingOperators.map(operator=><option key={operator.personId} value={operator.personId}>
                        {operator.firstName} {operator.lastName}
                      </option>)}
                    </select>
                    <span className="mt-2 block text-xs text-muted-foreground">Only the selected active site registrar/operator can acknowledge receipt after opening. This does not waive readiness checks.</span>
                    {!launch.openingOperators.length&&<span role="alert" className="mt-2 block text-xs">No active site registrar/operator is available. An existing authorized site grant is required.</span>}
                  </label>}
                  <button
                    type="button"
                    className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                    disabled={busy || !activatable || Boolean(launch.siteId&&!openingRecipients[launch.id])}
                    onClick={() => activate(launch.id)}
                  >
                    Activate
                  </button>
                  {!activatable && launch.journey && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      {blockingIncomplete.length} blocking requirement
                      {blockingIncomplete.length === 1 ? "" : "s"} remaining before activation.
                    </p>
                  )}
                </div>
              </article>
            );
          })}
          {!launches?.launches.length && (
            <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
              No launches in progress for your organizations. Start one with the form.
            </p>
          )}
        </div>
      </section>
    </WorkspaceShell>
  );
}
