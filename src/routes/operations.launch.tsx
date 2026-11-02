import { useEffect, useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { LaunchPortfolio } from "@/components/operations/LaunchPortfolio";
import { ValidationError } from "@/domain/errors";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import {
  activateLaunch,
  completeLaunchRequirement,
  listLaunches,
  listLaunchOptions,
  startLaunch,
  createLaunchOrganization,
  createLaunchSite,
  scheduleLaunchOrientation,
} from "@/modules/programs/launch.functions";

const programTypes = [
  "church_hosted_academy",
  "high_school_extension",
  "full_school",
  "microschool",
  "hybrid_program",
  "homeschool_cohort",
  "summer_enrichment",
] as const;

const grades = ["TK", "K", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];
const organizationTypes = [
  ["church", "Church"],
  ["christian_school", "Christian school"],
  ["microschool_operator", "Microschool operator"],
  ["denomination", "Denomination / network partner"],
  ["consortium", "Consortium"],
  ["other_partner", "Other partner"],
] as const;

const typeLabels: Record<string, string> = {
  church_hosted_academy: "Church-hosted academy",
  high_school_extension: "High school extension",
  full_school: "Full school",
  microschool: "Microschool",
  hybrid_program: "Hybrid program",
  homeschool_cohort: "Homeschool cohort",
  summer_enrichment: "Summer enrichment",
};

const requirementStatusLabels: Record<string, string> = {
  needs_you: "Needs you",
  needs_can: "Needs CAN",
  waiting_third_party: "Waiting on third party",
  blocked: "Blocked",
  complete: "Complete",
};

export const Route = createFileRoute("/operations/launch")({
  loader: async () => {
    try {
      return {
        options: await listLaunchOptions(),
        launches: await listLaunches(),
        authError: "",
      };
    } catch {
      return { options: null, launches: null, authError: "Sign in with an authorized registrar account to manage program launches." };
    }
  },
  component: LaunchWizardPage,
});

function LaunchWizardPage() {
  const selection=Route.useSearch();
  const { options, launches, authError }: {
    options: Awaited<ReturnType<typeof listLaunchOptions>> | null;
    launches: Awaited<ReturnType<typeof listLaunches>> | null;
    authError: string;
  } = Route.useLoaderData();
  const router = useRouter();
  const mutation = useMutationFeedback();
  const busy = mutation.disabled;
  const [interactive, setInteractive] = useState(false);
  const [created, setCreated] = useState<{ programId: string; journeyId: string } | null>(null);
  const [openingRecipients,setOpeningRecipients]=useState<Record<string,string>>({});
  const [opened,setOpened]=useState<{siteId:string|null;name:string}|null>(null);

  const [type, setType] = useState<string>("church_hosted_academy");
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
  const [newOrganizationType,setNewOrganizationType]=useState<string>("christian_school");
  const [newOrganizationName,setNewOrganizationName]=useState("");
  const [newOrganizationLegalName,setNewOrganizationLegalName]=useState("");
  const [newOrganizationSlug,setNewOrganizationSlug]=useState("");
  const [createdOrganization,setCreatedOrganization]=useState<{id:string;name:string}|null>(null);
  const [newSiteName,setNewSiteName]=useState("");
  const [newSiteSlug,setNewSiteSlug]=useState("");
  const [newSiteTimezone,setNewSiteTimezone]=useState("America/Los_Angeles");
  const [newSiteLine1,setNewSiteLine1]=useState("");
  const [newSiteCity,setNewSiteCity]=useState("");
  const [newSiteRegion,setNewSiteRegion]=useState("");
  const [newSitePostalCode,setNewSitePostalCode]=useState("");
  const [newSiteCountry,setNewSiteCountry]=useState("");
  const [orientationFor,setOrientationFor]=useState("");
  const [orientationStart,setOrientationStart]=useState("");
  const [orientationEnd,setOrientationEnd]=useState("");
  const [orientationTitle,setOrientationTitle]=useState("Student and family orientation");
  useEffect(() => setInteractive(true), []);
  async function addOrientation(programId:string){
    const outcome = await mutation.run(async () => {
      if(!orientationStart||!orientationEnd)throw new ValidationError("Choose orientation start and end times");
      return scheduleLaunchOrientation({data:{programId,title:orientationTitle,
        startsAt:new Date(orientationStart).toISOString(),
        endsAt:new Date(orientationEnd).toISOString(),timezone:"America/Los_Angeles"}});
    }, {
      fallback:"Unable to schedule orientation.",
      success:"Orientation scheduled.",
      refresh:()=>router.invalidate(),
    });
    if(outcome.status==="saved"||outcome.status==="refresh-failed")setOrientationFor("");
  }
  async function addSite(){
    if(!hostOrganizationId)return;
    const outcome = await mutation.run(()=>createLaunchSite({data:{organizationId:hostOrganizationId,name:newSiteName,
        slug:newSiteSlug,timezone:newSiteTimezone,address:{
          ...(newSiteLine1.trim()?{line1:newSiteLine1.trim()}:{}),
          ...(newSiteCity.trim()?{city:newSiteCity.trim()}:{}),
          ...(newSiteRegion.trim()?{region:newSiteRegion.trim()}:{}),
          ...(newSitePostalCode.trim()?{postalCode:newSitePostalCode.trim()}:{}),
          ...(newSiteCountry.trim()?{country:newSiteCountry.trim()}:{}),
        }}}), {
      fallback:"Unable to create site.",
      success:"Site created.",
      refresh:()=>router.invalidate(),
    });
    if(outcome.status==="saved"||outcome.status==="refresh-failed"){
      setSiteId(outcome.value.siteId);
      setNewSiteName("");setNewSiteSlug("");setNewSiteLine1("");
      setNewSiteCity("");setNewSiteRegion("");setNewSitePostalCode("");
    }
  }

  async function addOrganization(){
    if(!hostOrganizationId)return;
    const outcome = await mutation.run(()=>createLaunchOrganization({data:{
        parentOrganizationId:hostOrganizationId,
        type:newOrganizationType as (typeof organizationTypes)[number][0],
        name:newOrganizationName,
        legalName:newOrganizationLegalName,
        slug:newOrganizationSlug,
      }}), {
      fallback:"Unable to create Organization profile.",
      success:"Organization profile created.",
    });
    if(outcome.status==="saved"){
      const organization=outcome.value;
      setCreatedOrganization({id:organization.organizationId,name:organization.name});
      setNewOrganizationName("");setNewOrganizationLegalName("");setNewOrganizationSlug("");
    }
  }

  const hostSites = options?.sites.filter((site) => site.organizationId === hostOrganizationId) ?? [];

  async function submitLaunch(event: React.FormEvent) {
    event.preventDefault();
    setCreated(null);
    const outcome = await mutation.run(()=>startLaunch({
        data: {
          name,
          slug,
          type: type as (typeof programTypes)[number],
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
          creditIssuingOrganizationId,
          ...(siteId ? { siteId } : {}),
        },
      }), {
      fallback:"Unable to start launch.",
      success:"Program launch started.",
      refresh:()=>router.invalidate(),
    });
    if(outcome.status==="saved"||outcome.status==="refresh-failed"){
      setCreated(outcome.value);
    }
  }

  async function completeRequirement(journeyRequirementId: string) {
    await mutation.run(
      () => completeLaunchRequirement({ data: { journeyRequirementId } }),
      {
        fallback:"Unable to complete requirement.",
        success:"Launch requirement completed.",
        refresh:()=>router.invalidate(),
      },
    );
  }

  async function activate(programId: string) {
    const outcome=await mutation.run(
      () => activateLaunch({ data: { programId,recipientPersonId:openingRecipients[programId]||undefined } }),
      {
        fallback:"Unable to activate program.",
        success:"Program activated.",
        refresh:()=>router.invalidate(),
      },
    );
    if(outcome.status==="saved"||outcome.status==="refresh-failed"){
      const launch=launches?.launches.find(item=>item.id===programId);
      if(launch)setOpened({siteId:launch.siteId,name:launch.name});
    }
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
        {mutation.error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-400 p-3">{mutation.error}</p>
        )}
        {mutation.notice && (
          <p role="status" className="mt-4 rounded-lg border p-3">{mutation.notice}</p>
        )}
        {opened&&<p role="status" className="mt-4 rounded-lg border p-4 text-sm">
          {opened.name} is active. {opened.siteId?<Link to="/sites/$siteId" params={{siteId:opened.siteId}}
            className="underline">Open Site Today to review the named operator handoff →</Link>:"Opening is recorded."}
        </p>}

        <LaunchPortfolio launches={launches.launches} sites={options.sites} siteId={selection.siteId} programId={selection.programId}/>
        <div className="mt-8 grid gap-6">
          <details className="rounded-xl border bg-card p-5">
            <summary className="cursor-pointer text-lg font-semibold">Start a new program launch</summary>
            {created && (
              <p role="status" className="mt-4 rounded-lg border p-3 text-sm">
                Launch started. Program <code>{created.programId}</code> with Launch Journey{" "}
                <code>{created.journeyId}</code> is now in the checklist below.
              </p>
            )}
            <form className="mt-4 space-y-5" onSubmit={submitLaunch}>
              <fieldset disabled={!interactive || busy} className="space-y-5">
              <fieldset>
                <legend className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Program
                </legend>
                <div className="mt-2 space-y-3">
                  <label className="block text-xs">
                    Program type
                    <select aria-label="Program type" className={selectClass} value={type} onChange={(e) => setType(e.target.value)}>
                      {programTypes.map((value) => (
                        <option key={value} value={value}>{typeLabels[value]}</option>
                      ))}
                    </select>
                  </label>
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
                          {options.canCreateOrganizationAndSite&&<div className="rounded-lg border p-3">
                            <p className="text-xs font-semibold">Create Organization profile</p>
                            <p className="mt-1 text-xs text-muted-foreground">Creates the Organization record under the selected scoped parent. It does not grant anyone access to the new Organization.</p>
                            <div className="mt-2 grid gap-2 sm:grid-cols-2">
                              <select aria-label="New organization type" className={selectClass} value={newOrganizationType} onChange={e=>setNewOrganizationType(e.target.value)}>
                                {organizationTypes.map(([value,label])=><option key={value} value={value}>{label}</option>)}
                              </select>
                              <input aria-label="New organization name" placeholder="Organization name" className={inputClass} value={newOrganizationName} onChange={e=>setNewOrganizationName(e.target.value)}/>
                              <input aria-label="New organization legal name" placeholder="Legal name (optional)" className={inputClass} value={newOrganizationLegalName} onChange={e=>setNewOrganizationLegalName(e.target.value)}/>
                              <input aria-label="New organization slug" placeholder="organization-slug" className={inputClass} value={newOrganizationSlug} onChange={e=>setNewOrganizationSlug(e.target.value)}/>
                            </div>
                            <button type="button" disabled={busy||!hostOrganizationId||newOrganizationName.trim().length<2||!newOrganizationSlug.trim()} onClick={addOrganization} className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Create Organization profile</button>
                            {createdOrganization&&<p role="status" className="mt-3 text-xs">
                              {createdOrganization.name} is created. An authorized registrar must issue an explicit Organization-scoped grant before continuing.
                              {" "}<Link to="/admin" search={{organizationId:createdOrganization.id}} className="underline">Open administration to grant access →</Link>
                            </p>}
                          </div>}
                          <label className="block text-xs">
                            Host organization
                    <select
                      aria-label="Host organization"
                      className={selectClass}
                      value={hostOrganizationId}
                      onChange={(e) => {
                        setHostOrganizationId(e.target.value);
                        setSiteId("");
                      }}
                      required
                    >
                      <option value="">Select host organization…</option>
                      {options.organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                      ))}
                    </select>
                  </label>
                  {hostOrganizationId&&<Link to="/organizations/$organizationId" params={{organizationId:hostOrganizationId}} className="text-xs underline">Open Organization profile →</Link>}
                  <label className="block text-xs">
                    Site (optional)
                    <select aria-label="Site" className={selectClass} value={siteId} onChange={(e) => setSiteId(e.target.value)} disabled={!hostOrganizationId}>
                      <option value="">No local site</option>
                      {hostSites.map((site) => (
                        <option key={site.id} value={site.id}>{site.name} · {site.timezone}</option>
                      ))}
                    </select>
                  </label>
                  {siteId&&<Link to="/sites/$siteId/profile" params={{siteId}} className="text-xs underline">Open Site profile →</Link>}
                  {options.canCreateOrganizationAndSite&&<div className="rounded-lg border p-3">
                    <p className="text-xs font-semibold">Create Site profile</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input aria-label="New site name" placeholder="Campus name" className={inputClass} value={newSiteName} onChange={e=>setNewSiteName(e.target.value)}/>
                      <input aria-label="New site slug" placeholder="campus-slug" className={inputClass} value={newSiteSlug} onChange={e=>setNewSiteSlug(e.target.value)}/>
                      <input aria-label="New site timezone" placeholder="Timezone" className={inputClass} value={newSiteTimezone} onChange={e=>setNewSiteTimezone(e.target.value)}/>
                      <input aria-label="Site street address" placeholder="Street address" className={inputClass} value={newSiteLine1} onChange={e=>setNewSiteLine1(e.target.value)}/>
                      <input aria-label="Site city" placeholder="City" className={inputClass} value={newSiteCity} onChange={e=>setNewSiteCity(e.target.value)}/>
                      <input aria-label="Site state or region" placeholder="State / region" className={inputClass} value={newSiteRegion} onChange={e=>setNewSiteRegion(e.target.value)}/>
                      <input aria-label="Site postal code" placeholder="Postal code" className={inputClass} value={newSitePostalCode} onChange={e=>setNewSitePostalCode(e.target.value)}/>
                      <input aria-label="Site country" placeholder="Country" className={inputClass} value={newSiteCountry} onChange={e=>setNewSiteCountry(e.target.value)}/>
                    </div>
                    <button type="button" disabled={busy||!hostOrganizationId||!newSiteName.trim()||!newSiteSlug.trim()} onClick={addSite} className="mt-3 rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Create site</button>
                  </div>}
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
                      {options.organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs">
                    Credit-issuing organization
                    <select aria-label="Credit issuing organization" className={selectClass} value={creditIssuingOrganizationId} onChange={(e) => setCreditIssuingOrganizationId(e.target.value)} required>
                      <option value="">Select credit issuer…</option>
                      {options.organizations.map((organization) => (
                        <option key={organization.id} value={organization.id}>{organization.name}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </fieldset>

              <button
                type="submit"
                className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                disabled={!interactive || busy || !options.organizations.length || !!createdOrganization}
              >
                Start launch
              </button>
              {!options.organizations.length && (
                <p className="text-xs text-muted-foreground">
                  No organizations are in scope for this registrar grant.
                </p>
              )}
              </fieldset>
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
                    <Link to="/operations/launch/$programId" params={{programId:launch.id}}
                      search={{siteId:launch.siteId??undefined,programId:undefined}}
                      className="mt-2 inline-block text-xs font-semibold underline">Configure classes and instructors →</Link>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {typeLabels[launch.type] ?? launch.type}
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
                              disabled={!interactive || busy}
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
                      <button type="button" disabled={!interactive || busy} onClick={()=>setOrientationFor(orientationFor===launch.id?"":launch.id)}
                        className="text-xs font-semibold underline">Schedule family orientation</button>
                      {orientationFor===launch.id && <div className="mt-3 grid gap-2">
                        <label className="text-xs">Title<input className={inputClass} value={orientationTitle} onChange={e=>setOrientationTitle(e.target.value)}/></label>
                        <label className="text-xs">Start<input type="datetime-local" className={inputClass} value={orientationStart} onChange={e=>setOrientationStart(e.target.value)}/></label>
                        <label className="text-xs">End<input type="datetime-local" className={inputClass} value={orientationEnd} onChange={e=>setOrientationEnd(e.target.value)}/></label>
                        <p className="text-xs text-muted-foreground">Times are entered in your local browser timezone and saved with an explicit offset.</p>
                        <button type="button" disabled={!interactive || busy||!orientationStart||!orientationEnd}
                          onClick={()=>addOrientation(launch.id)} className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">Save orientation</button>
                      </div>}
                    </div>
                    <div className="mt-4">
                      {launch.siteId&&<label className="mb-3 block text-sm">Receiving site operator (required)
                        <select aria-label={"Receiving site operator for "+launch.name} value={openingRecipients[launch.id]??""}
                          onChange={event=>setOpeningRecipients(current=>({...current,[launch.id]:event.target.value}))}
                          disabled={!interactive || busy}
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
                        disabled={!interactive || busy || !activatable || Boolean(launch.siteId&&!openingRecipients[launch.id])}
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
