import { useState } from "react";
import { programTypes, programTypeLabels, isExtendedLearningType } from "@/domain/program-offerings";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { LaunchPortfolio } from "@/components/operations/LaunchPortfolio";
import { ExtendedLearningSeasonPlanner } from "@/components/operations/ExtendedLearningSeasonPlanner";
import { listExtendedSeasonPlanning } from "@/modules/activities/extended-learning.functions";
import {
  activateLaunch,
  completeLaunchRequirement,
  listLaunches,
  listLaunchOptions,
  startLaunch,
  createLaunchSite,
  scheduleLaunchOrientation,
} from "@/modules/programs/launch.functions";

const grades = ["TK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const requirementStatusLabels: Record<string, string> = {
  needs_you: "Needs you",
  needs_can: "Needs CAN",
  waiting_third_party: "Waiting on third party",
  blocked: "Blocked",
  complete: "Complete",
};

export const Route = createFileRoute("/operations/launch/")({
  loader: async () => {
    try {
      return {
        options: await listLaunchOptions(),
        launches: await listLaunches(),
        // A pending migration for extended programs must not prevent core school launch.
        extendedPlanning: await listExtendedSeasonPlanning().catch(() => null),
        authError: "",
      };
    } catch {
      return { options: null, launches: null, extendedPlanning: null, authError: "Sign in with an authorized registrar account to manage program launches." };
    }
  },
  component: LaunchWizardPage,
});

function LaunchWizardPage() {
  const selection=Route.useSearch();
  const { options, launches, extendedPlanning, authError }: {
    options: Awaited<ReturnType<typeof listLaunchOptions>> | null;
    launches: Awaited<ReturnType<typeof listLaunches>> | null;
    extendedPlanning: Awaited<ReturnType<typeof listExtendedSeasonPlanning>> | null;
    authError: string;
  } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{
    programId: string;
    journeyId: string;
    programType: (typeof programTypes)[number];
    publicSiteDraft: {
      siteId: string;
      host: string;
      status: "draft" | "published";
      created: boolean;
    } | null;
  } | null>(null);
  const [openingRecipients,setOpeningRecipients]=useState<Record<string,string>>({});
  const [opened,setOpened]=useState<{siteId:string|null;name:string}|null>(null);

  const [type, setType] = useState<(typeof programTypes)[number]>("church_hosted_academy");
  const [summerCreditBearing, setSummerCreditBearing] = useState(false);
  const creditMode = type === "summer_program" && summerCreditBearing ? "credit_bearing" : isExtendedLearningType(type) ? "non_credit" : "credit_bearing";
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [gradeMin, setGradeMin] = useState("K");
  const [gradeMax, setGradeMax] = useState("12");
  const [onsite, setOnsite] = useState(true);
  const [asynchronous, setAsynchronous] = useState(false);
  const [liveOnline, setLiveOnline] = useState(false);
  const [onsiteDaysPerWeek, setOnsiteDaysPerWeek] = useState("5");
  const [hostOrganizationId, setHostOrganizationId] = useState("");
  const [jurisdictionId, setJurisdictionId] = useState("");
  const [academicProviderOrganizationId, setAcademicProviderOrganizationId] = useState("");
  const [creditIssuingOrganizationId, setCreditIssuingOrganizationId] = useState("");
  const [siteId, setSiteId] = useState(selection.siteId??"");
  const [newSiteName,setNewSiteName]=useState("");
  const [createdSiteDraft,setCreatedSiteDraft]=useState<{siteId:string;host:string}|null>(null);
  const [newSiteSlug,setNewSiteSlug]=useState("");
  const [newSiteTimezone,setNewSiteTimezone]=useState("America/Los_Angeles");
  const [orientationFor,setOrientationFor]=useState("");
  const [orientationStart,setOrientationStart]=useState("");
  const [orientationEnd,setOrientationEnd]=useState("");
  const [orientationTitle,setOrientationTitle]=useState("Student and family orientation");
  async function addOrientation(programId:string){
    setBusy(true);setError("");
    try {
      if(!orientationStart||!orientationEnd)throw new Error("Choose orientation start and end times");
      await scheduleLaunchOrientation({data:{programId,title:orientationTitle,
        startsAt:new Date(orientationStart).toISOString(),
        endsAt:new Date(orientationEnd).toISOString(),timezone:"America/Los_Angeles"}});
      setOrientationFor("");await router.invalidate();
    } catch(e){setError(e instanceof Error?e.message:"Unable to schedule orientation");}
    finally{setBusy(false);}
  }
  async function addSite(){
    if(!hostOrganizationId)return;
    setBusy(true);setError("");
    try{
      const result=await createLaunchSite({data:{organizationId:hostOrganizationId,name:newSiteName,
        slug:newSiteSlug,timezone:newSiteTimezone}});
      setCreatedSiteDraft({siteId:result.siteId,host:result.publicSiteDraft.host});
      setSiteId(result.siteId);
      await router.invalidate();setNewSiteName("");setNewSiteSlug("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to create site");}
    finally{setBusy(false);}
  }

  const hostSites = options?.sites.filter((site) => site.organizationId === hostOrganizationId) ?? [];

  async function submitLaunch(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setCreated(null);
    try {
      const result = await startLaunch({
        data: {
          name,
          slug,
          type,
          gradeRange: { min: gradeMin, max: gradeMax },
          deliveryModel: {
            onsite,
            asynchronous,
            liveOnline,
            ...(onsite && onsiteDaysPerWeek
              ? { onsiteDaysPerWeek: Number(onsiteDaysPerWeek) }
              : {}),
          },
          hostOrganizationId,
          jurisdictionId,
          academicProviderOrganizationId,
          creditMode,
          ...(creditMode === "credit_bearing" ? { creditIssuingOrganizationId } : {}),
          ...(siteId ? { siteId } : {}),
        },
      });
      setCreated({...result,programType:type});
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start launch");
    } finally {
      setBusy(false);
    }
  }

  async function completeRequirement(journeyRequirementId: string) {
    setBusy(true);
    setError("");
    try {
      await completeLaunchRequirement({ data: { journeyRequirementId } });
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to complete requirement");
    } finally {
      setBusy(false);
    }
  }

  async function activate(programId: string) {
    setBusy(true);
    setError("");
    try {
      await activateLaunch({ data: { programId,recipientPersonId:openingRecipients[programId]||undefined } });
      const launch=launches?.launches.find(item=>item.id===programId);
      if(launch)setOpened({siteId:launch.siteId,name:launch.name});
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to activate program");
    } finally {
      setBusy(false);
    }
  }

  function applyNinthGradeHybridPreset(){
    // Explicit form proposal only. No accreditation, staffing, credit issuer,
    // timetable, attendance or regulatory readiness is silently accepted.
    setType("high_school_extension");
    setGradeMin("9");setGradeMax("9");
    setOnsite(true);setOnsiteDaysPerWeek("2");
    setAsynchronous(true);setLiveOnline(false);
  }
  function applyExtendedLearningPreset(offering: "summer_program" | "summer_enrichment" | "after_school_enrichment") {
    setType(offering);
    setSummerCreditBearing(false);
    setGradeMin("K"); setGradeMax("12");
    setOnsite(true); setAsynchronous(false); setLiveOnline(false);
    setOnsiteDaysPerWeek(offering === "after_school_enrichment" ? "3" : "5");
  }
  const selectClass = "mt-1 block w-full rounded-lg border bg-background p-2 text-sm";
  const inputClass = "mt-1 block w-full rounded-lg border bg-background p-2 text-sm";

  if (authError || !options || !launches) {
    return (
      <main className="min-h-screen bg-background px-6 py-10 text-foreground">
        <div className="mx-auto max-w-5xl">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            CAN OS · Program launch
          </p>
          <h1 className="mt-2 font-serif text-4xl">Host / program launch</h1>
          <p role="alert" className="mt-8 rounded-lg border p-4 text-sm">
            {authError || "Launch data is unavailable."}
          </p>
        </div>
      </main>
    );
  }

  return (
    <WorkspaceShell width="wide" eyebrow="CAN OS · Program launch" title="Host / program launch"
      subtitle="Launch programs on an Organization → Site → Program foundation, with recorded readiness and explicit blocking requirements."
      breadcrumbs={<><Link to="/operations" search={{siteId:selection.siteId,programId:selection.programId}} className="underline">Operations</Link><span>/</span><span>Program launches</span></>}
      actions={<Link to="/operations/workflows" search={{siteId:selection.siteId,programId:selection.programId}} className="rounded-lg border px-3 py-2 text-sm">Connected workflows</Link>}>
        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-400 p-3">{error}</p>
        )}
        {opened&&<p role="status" className="mt-4 rounded-lg border p-4 text-sm">
          {opened.name} is active. {opened.siteId?<Link to="/sites/$siteId" params={{siteId:opened.siteId}}
            className="underline">Open Site Today to review the named operator handoff →</Link>:"Opening is recorded."}
        </p>}

        <LaunchPortfolio launches={launches.launches} sites={options.sites} siteId={selection.siteId} programId={selection.programId}/>
        <div className="mt-8 grid gap-6">
          {extendedPlanning ? <ExtendedLearningSeasonPlanner planning={extendedPlanning} siteId={selection.siteId} /> : <p role="status" className="rounded-lg border p-3 text-sm">Extended-learning planning is unavailable. Verify database migrations 0032–0033; school launches remain accessible.</p>}
          <details className="rounded-xl border bg-card p-5">
            <summary className="cursor-pointer text-lg font-semibold">Start a new program launch</summary>
            {created && <div role="status" className="mt-4 rounded-lg border p-3 text-sm">
              <p>Launch started. Program <code>{created.programId}</code> with Launch Journey{" "}
                <code>{created.journeyId}</code> is now in the checklist below.</p>
              <nav aria-label="Next steps for your new program" className="mt-4 flex flex-wrap gap-3">
                <Link to="/operations/launch/$programId" params={{programId:created.programId}}
                  search={{siteId:created.publicSiteDraft?.siteId,programId:undefined}}
                  className="rounded-lg border px-3 py-2 text-sm font-semibold">1. Set up classes and staff →</Link>
                {!isExtendedLearningType(created.programType) && <Link to="/admissions/intake"
                  search={{siteId:created.publicSiteDraft?.siteId,programId:created.programId}}
                  className="rounded-lg border px-3 py-2 text-sm font-semibold">2. Start the first family inquiry →</Link>}
              </nav>
              <p className="mt-3 text-xs text-muted-foreground">These are planning actions, not authorization to open. Institutional agreements, academic readiness and child safety must still be independently approved before active enrollment or onsite attendance.</p>
              {created.publicSiteDraft && <details className="mt-3 rounded-lg border p-3">
                <summary className="cursor-pointer text-sm font-semibold">Optional: website and marketing setup</summary>
                <p className="font-semibold">
                  {created.publicSiteDraft.created
                    ? "Website draft automatically prepared"
                    : "Existing Site website address retained"}
                </p>
                <p className="mt-1 font-mono">{created.publicSiteDraft.host}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {created.publicSiteDraft.status === "published"
                    ? "The Site already has a marketing approval; launch does not change its status or open admissions."
                    : "Private draft only. Publishing requires a separate authorized review; no admissions or hosting is opened."}
                </p>
                <Link to="/sites/$siteId/publish"
                  params={{siteId:created.publicSiteDraft.siteId}}
                  className="mt-2 inline-block underline">
                  Review Site website (separate publisher grant required) →
                </Link>
              </details>}
              {!created.publicSiteDraft && <p className="mt-2 text-xs text-muted-foreground">
                No local Site was selected, so this Program launch has no Site website draft.
              </p>}
            </div>}
            <div className="mt-4 rounded-lg border p-4">
              <p className="font-semibold text-sm">Suggested school-in-a-box starting point</p>
              <p className="mt-2 text-sm text-muted-foreground">Grade 9 hybrid extension: two on-site days and asynchronous instruction on the remaining days. This only pre-fills the proposal; your school must verify its staffing, calendar, academic provider and legal credit issuer before opening.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={applyNinthGradeHybridPreset}>Grade 9 hybrid</button>
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => applyExtendedLearningPreset("summer_program")}>Summer academic program</button>
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => applyExtendedLearningPreset("summer_enrichment")}>Summer camp / enrichment</button>
                <button type="button" className="rounded-lg border px-3 py-2 text-sm" onClick={() => applyExtendedLearningPreset("after_school_enrichment")}>After-school enrichment</button>
              </div>
            </div>
            <form className="mt-4 space-y-5" onSubmit={submitLaunch}>
              <fieldset>
                <legend className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Program
                </legend>
                <div className="mt-2 space-y-3">
                  <label className="block text-xs">
                    Program type
                    <select aria-label="Program type" className={selectClass} value={type} onChange={(e) => setType(e.target.value as (typeof programTypes)[number])}>
                      {programTypes.map((value) => (
                        <option key={value} value={value}>{programTypeLabels[value]}</option>
                      ))}
                    </select>
                  </label>
                  {type === "summer_program" && (
                    <label className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={summerCreditBearing} onChange={e => setSummerCreditBearing(e.target.checked)} />
                      Offer credit-bearing summer coursework (requires an authorized credit issuer)
                    </label>
                  )}
                  {isExtendedLearningType(type) && <p className="text-xs text-muted-foreground">Summer and after-school offerings share the Program record. Existing academic-year, section, staffing and opening gates still apply; short-course registration and recurring-session operations need further integration.</p>}
                  <label className="block text-xs">
                    Name
                    <input aria-label="Program name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} required maxLength={200} />
                  </label>
                  <label className="block text-xs">
                    Slug
                    <input aria-label="Program slug" className={inputClass} value={slug} onChange={(e) => setSlug(e.target.value)} required pattern="[a-z0-9]+(-[a-z0-9]+)*" placeholder="grace-academy-hs" />
                  </label>
                  <div className="flex gap-3">
                    <label className="block flex-1 text-xs">
                      Grade range min
                      <select aria-label="Minimum grade" className={selectClass} value={gradeMin} onChange={(e) => setGradeMin(e.target.value)}>
                        {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                      </select>
                    </label>
                    <label className="block flex-1 text-xs">
                      Grade range max
                      <select aria-label="Maximum grade" className={selectClass} value={gradeMax} onChange={(e) => setGradeMax(e.target.value)}>
                        {grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Delivery model
                </legend>
                <div className="mt-2 flex flex-wrap gap-4 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={onsite} onChange={(e) => setOnsite(e.target.checked)} />
                    Onsite
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={liveOnline} onChange={(e) => setLiveOnline(e.target.checked)} />
                    Live online
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={asynchronous} onChange={(e) => setAsynchronous(e.target.checked)} />
                    Asynchronous
                  </label>
                  {onsite && (
                    <label className="flex items-center gap-2 text-xs">
                      Onsite days/week
                      <input
                        aria-label="Onsite days per week"
                        type="number"
                        min={1}
                        max={7}
                        className="w-20 rounded-lg border bg-background p-2 text-sm"
                        value={onsiteDaysPerWeek}
                        onChange={(e) => setOnsiteDaysPerWeek(e.target.value)}
                      />
                    </label>
                  )}
                </div>
              </fieldset>

              <fieldset>
                <legend className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Organizations & jurisdiction
                </legend>
                <div className="mt-2 space-y-3">
                  <label className="block text-xs">
                    Host organization
                    <select
                      aria-label="Host organization"
                      className={selectClass}
                      value={hostOrganizationId}
                      onChange={(e) => {
                        setHostOrganizationId(e.target.value);
                        setSiteId("");
                        setCreatedSiteDraft(null);
                      }}
                      required
                    >
                      <option value="">Select host organization…</option>
                      {options.organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs">
                    Site (optional)
                    <select aria-label="Site" className={selectClass} value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={!hostOrganizationId}>
                      <option value="">No local site</option>
                      {hostSites.map((site) => (
                        <option key={site.id} value={site.id}>{site.name} · {site.timezone}</option>
                      ))}
                    </select>
                  </label>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs font-semibold">New host site</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input aria-label="New site name" placeholder="Campus name" className={inputClass} value={newSiteName} onChange={e=>setNewSiteName(e.target.value)}/>
                      <input aria-label="New site slug" placeholder="campus-slug" className={inputClass} value={newSiteSlug} onChange={e=>setNewSiteSlug(e.target.value)}/>
                      <input aria-label="New site timezone" placeholder="Timezone" className={inputClass} value={newSiteTimezone} onChange={e=>setNewSiteTimezone(e.target.value)}/>
                    </div>
                    <button type="button" disabled={busy||!hostOrganizationId||!newSiteName.trim()||!newSiteSlug.trim()} onClick={addSite} className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Create site</button>
                    {createdSiteDraft && <div role="status" className="mt-3 rounded-lg border p-3 text-sm">
                      <p className="font-semibold">Your website draft is prepared</p>
                      <p className="mt-1 font-mono">{createdSiteDraft.host}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Private draft only. The address is reserved, but no public site, admissions,
                        or registration is open. An explicitly authorized Site publisher must
                        review and approve marketing before publication.
                      </p>
                      <Link to="/sites/$siteId/publish" params={{siteId:createdSiteDraft.siteId}}
                        className="mt-2 inline-block underline">Open private website setup (publisher access required) →</Link>
                    </div>}
                  </div>
                  <label className="block text-xs">
                    Jurisdiction
                    <select aria-label="Jurisdiction" className={selectClass} value={jurisdictionId} onChange={(e) => setJurisdictionId(e.target.value)} required>
                      <option value="">Select jurisdiction…</option>
                      {options.jurisdictions.map((jurisdiction) => (
                        <option key={jurisdiction.id} value={jurisdiction.id}>{jurisdiction.name} ({jurisdiction.code})</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs">
                    Academic provider
                    <select aria-label="Academic provider organization" className={selectClass} value={academicProviderOrganizationId} onChange={(e) => setAcademicProviderOrganizationId(e.target.value)} required>
                      <option value="">Select academic provider…</option>
                      {options.academicProviderOrganizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}{organization.type === "can_network" ? " (CAN academic provider)" : ""}</option>
                      ))}
                    </select>
                  </label>
                  {creditMode === "credit_bearing" ? (
                    <label className="block text-xs">
                      Credit-issuing organization
                      <select aria-label="Credit issuing organization" className={selectClass} value={creditIssuingOrganizationId} onChange={(e) => setCreditIssuingOrganizationId(e.target.value)} required>
                      <option value="">Select credit issuer…</option>
                      {options.creditIssuingOrganizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}{organization.type === "can_network" ? " (CAN credit issuer)" : ""}</option>
                      ))}
                    </select>
                    </label>
                  ) : (
                    <p className="text-xs text-muted-foreground">Noncredit offering: no credit issuer required; it does not contribute to official transcripts.</p>
                  )}
                  <p className="text-xs text-muted-foreground">Selecting CAN as the academic provider or credit issuer records a proposed arrangement only. It does not prove an executed agreement, school-of-record authority, accreditation or CAN staff access to the host's student records. Separate approval and access grants are required before operating.</p>
                </div>
              </fieldset>

              <button
                type="submit"
                className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                disabled={busy || !options.organizations.length}
              >
                Start launch
              </button>
              {!options.organizations.length && (
                <p className="text-xs text-muted-foreground">
                  No organizations are in scope for this registrar grant.
                </p>
              )}
            </form>
          </details>

          <section>
            <h2 className="font-serif text-2xl">Launches in progress</h2>
            <div className="mt-4 space-y-3">
              {launches.launches.filter(launch=>(!selection.siteId||launch.siteId===selection.siteId)&&(!selection.programId||launch.id===selection.programId)).map((launch) => {
                const blockingIncomplete = launch.requirements.filter(
                  (requirement) => requirement.blocking && requirement.status !== "complete",
                );
                const activatable = !!launch.journey && blockingIncomplete.length === 0;
                return (
                  <article key={launch.id} className="rounded-xl border bg-card p-5">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold">{launch.name}</h3>
                      <span className="text-xs uppercase text-muted-foreground">{launch.status}</span>
                    </div>
                    <nav className="mt-3 flex flex-wrap gap-4 text-xs font-semibold" aria-label={launch.name+" launch next actions"}>
                      <Link to="/operations/launch/$programId" params={{programId:launch.id}}
                        search={{siteId:launch.siteId??undefined,programId:undefined}}
                        className="underline">Configure classes and instructors →</Link>
                      {!isExtendedLearningType(launch.type)&&<Link to="/admissions/intake"
                        search={{siteId:launch.siteId??undefined,programId:launch.id}}
                        className="underline">Start family intake →</Link>}
                    </nav>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {programTypeLabels[launch.type] ?? launch.type}
                      {launch.journey ? ` · Journey: ${launch.journey.status}` : " · No launch journey"}
                    </p>
                    <ul className="mt-3 space-y-2">
                      {launch.requirements.map((requirement) => (
                        <li key={requirement.id} className="flex items-center justify-between gap-3 rounded-lg border p-2 text-sm">
                          <span>
                            {requirement.title}
                            {requirement.blocking && (
                              <span className="ml-2 rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase">
                                Blocking
                              </span>
                            )}
                            <span className="ml-2 text-xs text-muted-foreground">
                              {requirementStatusLabels[requirement.status] ?? requirement.status}
                            </span>
                          </span>
                          {requirement.status !== "complete" && (
                            <button
                              type="button"
                              className="rounded border px-3 py-1 text-xs disabled:opacity-50"
                              disabled={busy}
                              onClick={() => completeRequirement(requirement.id)}
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
              {!launches.launches.length && (
                <p className="rounded-xl border bg-card p-5 text-sm text-muted-foreground">
                  No launches in progress for your organizations. Start one with the form.
                </p>
              )}
            </div>
          </section>
        </div>
    </WorkspaceShell>
  );
}
