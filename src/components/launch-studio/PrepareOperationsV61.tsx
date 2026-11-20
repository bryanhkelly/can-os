import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { LaunchSiteFacilitiesWorkspaceV61 } from "./LaunchSiteFacilitiesWorkspaceV61";
import { LaunchClassFacilitiesWorkspaceV61 } from "./LaunchClassFacilitiesWorkspaceV61";
import { SchoolYearCreateForm } from "@/components/operations/SchoolYearCreateForm";
import { getSchoolYearStudio } from "@/modules/academic-time/school-year-studio.functions";
import { ActionDialog, ActionFooter, WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import {
  cleanSiteEnvironmentV61, siteEnvironmentV61Schema,
  type SiteEnvironmentV61,
} from "@/domain/site-information-v61";
import {
  readSiteInformationV61, saveSiteInformationV61,
} from "@/modules/programs/site-information-v61.functions";
import { useLaunchUnsavedChanges } from "./useLaunchUnsavedChanges";

/** Mount the existing authorized services only in the requested Prepare module.
 * The two workspaces remain reusable independently of Launch Studio. */
const ScopedAdminConsole = lazy(async () => {
  const module = await import("@/components/operations/ScopedAdminConsole");
  return { default: module.ScopedAdminConsole };
});
const NativeClassManager = lazy(async () => {
  const module = await import("@/components/learning/NativeClassManager");
  return { default: module.NativeClassManager };
});

type EnvironmentDraft = {
  delivery: SiteEnvironmentV61["delivery"] | "";
  physicalSpaceArrangement: SiteEnvironmentV61["physicalSpaceArrangement"];
};
const emptyEnvironment: EnvironmentDraft = { delivery: "", physicalSpaceArrangement: "" };
const snapshot = (value: EnvironmentDraft) => JSON.stringify(value);

/** Facilities keep the exact authoritative Site Information data source.
 * Room records are owned by the established room/coverage service.
 * Saving either is planning only, not evidence verification. */
export function PrepareFacilitiesV61({ siteId }: { siteId: string }) {
  const [environment, setEnvironment] = useState<EnvironmentDraft>(emptyEnvironment);
  const [savedSnapshot, setSavedSnapshot] = useState(snapshot(emptyEnvironment));
  const [revision, setRevision] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reconciliationRequired, setReconciliationRequired] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);
  const [confirmReload, setConfirmReload] = useState(false);
  const saveLock = useRef(false);
  const dirty = snapshot(environment) !== savedSnapshot;
  useLaunchUnsavedChanges(dirty || saving || reconciliationRequired,
    "Leave Facilities & Resources? Unsaved learning environment answers will be lost.");

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    setNotice("");
    void readSiteInformationV61({ data: { siteId } }).then(result => {
      if (!active) return;
      if (result.siteId !== siteId) throw new Error("The response did not match your Site.");
      setEnvironment(result.environment);
      setSavedSnapshot(snapshot(result.environment));
      setRevision(result.revision);
      setReconciliationRequired(false);
    }).catch(() => {
      if (active) {
        setRevision(null);
        setError("Learning environment could not be verified. Reload the saved Site Information before editing.");
      }
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [siteId, reload]);

  async function saveEnvironment() {
    if (saveLock.current || loading || reconciliationRequired || !revision || !dirty) return;
    const parsed = siteEnvironmentV61Schema.safeParse(environment);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Select a valid learning environment.");
      return;
    }
    const clean = cleanSiteEnvironmentV61(parsed.data);
    const expectedRevision = revision;
    saveLock.current = true;
    setSaving(true);
    setError("");
    setNotice("");
    try {
      // The existing Site Information service enforces exact Site scope, updates
      // Program delivery preferences consistently, and audits the revision.
      const result = await saveSiteInformationV61({
        data: { siteId, expectedRevision, section: "environment", environment: clean },
      });
      if (result.siteId !== siteId || !result.revision) {
        throw new Error("The saved Site revision could not be verified.");
      }
      setRevision(result.revision);
      setEnvironment(clean);
      setSavedSnapshot(snapshot(clean));
      setNotice("Learning environment saved in Site Information. Site suitability and permissions are still unverified.");
    } catch {
      // A failed response may follow a committed mutation. Never blindly replay.
      setReconciliationRequired(true);
      setError("Save outcome could not be verified. Reload saved Site Information before making another change.");
    } finally {
      saveLock.current = false;
      setSaving(false);
    }
  }

  return <div className="space-y-5">
    <WorkspacePanel title="Learning environment"
      description="The same authoritative answers saved in Establish → Site Information. Changing these values here updates that Site record, not a second facilities checklist.">
      {loading ? <p role="status" className="mt-3 text-sm">Reading saved learning environment…</p>
      : <>
        {error && <WorkspaceNotice tone="danger" className="mt-3">{error}</WorkspaceNotice>}
        {notice && <WorkspaceNotice tone="info" className="mt-3">{notice}</WorkspaceNotice>}
        {reconciliationRequired && <WorkspaceNotice tone="attention">
          A previous save may have succeeded. Reload the saved record before retrying.
        </WorkspaceNotice>}
        {revision && <form className="mt-4 grid gap-4 sm:grid-cols-2"
          onSubmit={event => {event.preventDefault(); void saveEnvironment();}}>
          <Field label="Delivery model">
            <Select className="min-h-11 w-full" value={environment.delivery}
              disabled={saving || reconciliationRequired}
              onChange={event => setEnvironment(current => ({
                ...current,
                delivery: event.currentTarget.value as EnvironmentDraft["delivery"],
                physicalSpaceArrangement: event.currentTarget.value === "digital"
                  ? "" : current.physicalSpaceArrangement,
              }))}>
              <option value="">Select a delivery model</option>
              <option value="physical">On site</option>
              <option value="digital">Online</option>
              <option value="both">Blended / hybrid</option>
            </Select>
          </Field>
          {environment.delivery !== "digital" && <Field label="Physical space arrangement">
            <Select className="min-h-11 w-full"
              disabled={saving || reconciliationRequired}
              value={environment.physicalSpaceArrangement}
              onChange={event => setEnvironment(current => ({
                ...current,
                physicalSpaceArrangement: event.currentTarget.value as EnvironmentDraft["physicalSpaceArrangement"],
              }))}>
              <option value="">Select a space arrangement</option>
              <option value="owned_leased">Owned or leased</option>
              <option value="shared_hosted">Shared or hosted</option>
              <option value="planned">Still being arranged</option>
            </Select>
          </Field>}
          <ActionFooter layout="inline" className="mt-0 sm:col-span-2">
            <Button type="submit" disabled={saving || reconciliationRequired || !dirty} loading={saving} loadingLabel="Saving learning environment...">Save learning environment</Button>
            <span className="text-xs text-muted-foreground">
              {dirty ? "Unsaved changes" : "No unsaved changes"}
            </span>
          </ActionFooter>
        </form>}
      </>}
      <div className="mt-4">
        <Button type="button" variant="outline" size="sm" disabled={loading || saving}
          onClick={() => {
            if (dirty) setConfirmReload(true);
            else setReload(value => value + 1);
          }}>
          Reload saved environment
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">
          Reloading discards local edits and reads the current saved Site revision.
        </p>
      </div>
      <ActionDialog open={confirmReload}
        title="Discard unsaved environment changes?"
        description="Reloading will replace the local form with the current saved Site Information. It does not alter the saved record."
        confirmLabel="Discard and reload" destructive
        onClose={() => setConfirmReload(false)}
        onConfirm={() => {
          setConfirmReload(false);
          setReload(value => value + 1);
        }} />
    </WorkspacePanel>
    <LaunchSiteFacilitiesWorkspaceV61 key={siteId} siteId={siteId} />
    <WorkspaceNotice tone="info">
      Room occupancy is self-reported planning capacity. Approved building use,
      accessibility, connectivity, special equipment, and jurisdiction-specific
      suitability require their own verified evidence.
    </WorkspaceNotice>
  </div>;
}

/** Exact-Site staff identity and invitation services, not a second staff roster.
 * The staff console already creates inactive, auditable invitations and
 * independently derives accepted/safeguarding qualification status. */
export function PrepareTeamV61({ siteId }: { siteId: string }) {
  const [view, setView] = useState<"invite" | "access">("invite");
  return <div className="space-y-5">
    <WorkspacePanel title="Build the Site team"
      description="Invite people to this Site and inspect accepted role grants and safeguarding progress without granting them approval automatically.">
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Team tasks">
        <Button type="button" variant={view === "invite" ? "default" : "outline"}
          aria-pressed={view === "invite"} onClick={() => setView("invite")}>Invite team</Button>
        <Button type="button" variant={view === "access" ? "default" : "outline"}
          aria-pressed={view === "access"} onClick={() => setView("access")}>Review access & qualifications</Button>
      </div>
    </WorkspacePanel>
    <Suspense fallback={<p role="status" className="border p-4 text-sm">Loading Site staff workspace…</p>}>
      <ScopedAdminConsole key={siteId + ":" + view}
        selection={{ siteId }} lockedSiteId={siteId} mode={view} hubMode includeRoomCoverage={false}/>
    </Suspense>
    <WorkspaceNotice tone="info">
      Invitations remain inactive until accepted. Screening, training,
      qualifications, and assigned onsite coverage require independent verification.
    </WorkspaceNotice>
  </div>;
}

/** The real academic-year reader and creator are both available in Prepare.
 * Calendar details stay on the authoritative year record; no duplicate term or
 * calendar rows are authored by Launch Studio. */
export function PrepareSchoolYearsV61({siteId}: {siteId:string}) {
  const years = useQuery({
    queryKey: ["launch-prepare-school-years", siteId],
    queryFn: () => getSchoolYearStudio(),
    retry: false,
  });
  const [creating, setCreating] = useState(false);
  const [yearFormDirty, setYearFormDirty] = useState(false);
  // Register the existing V6.1 launch-frame navigation guard, rather than a
  // second browser confirm inside the embedded academic-year form.
  useLaunchUnsavedChanges(yearFormDirty,
    "Leave Schedules & Capacity? Unsaved school-year changes will be lost.");
  const [confirmClose, setConfirmClose] = useState(false);
  const siteYears = years.data?.years.filter(year => year.siteId === siteId) ?? [];
  const authorizedSite = years.data?.sites.some(site => site.id === siteId) ?? false;
  return <WorkspacePanel title="School years & academic calendars"
    description="Create and review real Site school years. Terms, holidays, grading periods and calendar days belong to the existing academic-year record.">
    {years.isPending && <p role="status" className="mt-3 text-sm">
      Reading authorized school-year records…
    </p>}
    {years.isError && <p role="alert" className="mt-3 text-sm text-muted-foreground">
      School years are unavailable for your current account. No calendar status is inferred.
    </p>}
    {years.data && !authorizedSite && <p role="alert" className="mt-3 text-sm">
      The selected Site is not authorized for academic-year management.
    </p>}
    {years.data && authorizedSite && <>
      {siteYears.length ? <ul className="mt-4 space-y-3">
        {siteYears.map(year => <li key={year.id}
          className="flex flex-wrap items-center justify-between gap-3 border bg-background p-3">
          <div>
            <p className="font-semibold">{year.name}</p>
            <p className="text-xs text-muted-foreground">
              {year.startsOn} to {year.endsOn} · {year.status}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {year.terms.length} terms · {year.calendars.length} calendars · {year.schedules.length} schedules
            </p>
          </div>
          <Button asChild size="sm" variant="outline">
            <Link to="/operations/school-years/$yearId" params={{yearId:year.id}}
              search={{siteId,programId:undefined}}>Open calendar</Link>
          </Button>
        </li>)}
      </ul> : <p className="mt-3 text-sm text-muted-foreground">
        No academic year has been created for this Site.
      </p>}
      <Button type="button" variant="outline" className="mt-4" onClick={() => {
        if (!creating) setCreating(true);
        else if (yearFormDirty) setConfirmClose(true);
        else setCreating(false);
      }}>
        {creating ? "Close school-year form" : "Add school year"}
      </Button>
      {creating && <div className="mt-5 border-t pt-5">
        <SchoolYearCreateForm data={years.data}
          selection={{siteId}} lockedSiteId={siteId} embedded
          onDirtyChange={setYearFormDirty}
          onDataChanged={() => years.refetch({throwOnError:true})}
          onCreated={async () => {
            await years.refetch({throwOnError:true});
            setCreating(false);
            setYearFormDirty(false);
          }} />
      </div>}
      <ActionDialog open={confirmClose}
        title="Discard unfinished school-year setup?"
        description="Unsaved dates or grading selections will be lost. Existing saved school years and calendars are unchanged."
        confirmLabel="Discard draft" destructive
        onClose={() => setConfirmClose(false)}
        onConfirm={() => {
          setConfirmClose(false);
          setCreating(false);
          setYearFormDirty(false);
        }} />
    </>}
    <p className="mt-3 text-xs text-muted-foreground">
      Creating a school year is not academic approval, a Class schedule,
      or evidence that learners may enroll.
    </p>
  </WorkspacePanel>;
}

/** Room schedules and Class drafts reuse canonical operational owners.
 * Prepare hides Class activation/Offering publishing; Open is independent. */
/** Canonical Class records own their Site Space and approved staff planning.
 * No legacy Section/room_coverage_schedule is mounted in Launch Studio. */
export function PrepareSchedulesV61({ siteId }: { siteId: string }) {
  const [showAcademicYears,setShowAcademicYears]=useState(false);
  return <div className="space-y-5">
    <Suspense fallback={<p role="status" className="border p-4 text-sm">
      Loading authorized Class preparation…
    </p>}>
      <NativeClassManager key={siteId} preferredSiteId={siteId} embedded prepareOnly />
    </Suspense>
    <LaunchClassFacilitiesWorkspaceV61 key={siteId} siteId={siteId} />
    <details className="border bg-card p-4" onToggle={event=>{
      if(event.currentTarget.open)setShowAcademicYears(true);
    }}>
      <summary className="min-h-11 cursor-pointer text-sm font-semibold text-primary">
        Academic years & calendars for school programs
      </summary>
      <p className="my-3 text-sm text-muted-foreground">
        School-year calendars are optional for short training and
        flexible, four-session programs.
      </p>
      {showAcademicYears&&<PrepareSchoolYearsV61 key={siteId} siteId={siteId}/>}
    </details>
    <WorkspaceNotice tone="info">
      A Class room link does not itself establish presence, room safety, instructor
      verification, or authorization to publish enrollment. Class Sessions
      continue to follow their canonical scheduled-delivery workflow.
    </WorkspaceNotice>
  </div>;
}
