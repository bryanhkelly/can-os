import { useState } from "react";
import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import {
  activateLaunch,
  completeLaunchRequirement,
  listLaunches,
  listLaunchOptions,
  startLaunch,
  createLaunchSite,
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
  const { options, launches, authError } = Route.useLoaderData();
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ programId: string; journeyId: string } | null>(null);

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
  const [siteId, setSiteId] = useState("");
  const [newSiteName,setNewSiteName]=useState("");
  const [newSiteSlug,setNewSiteSlug]=useState("");
  const [newSiteTimezone,setNewSiteTimezone]=useState("America/Los_Angeles");
  async function addSite(){
    if(!hostOrganizationId)return;
    setBusy(true);setError("");
    try{
      await createLaunchSite({data:{organizationId:hostOrganizationId,name:newSiteName,
        slug:newSiteSlug,timezone:newSiteTimezone}});
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
      });
      setCreated(result);
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
      await activateLaunch({ data: { programId } });
      await router.invalidate();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to activate program");
    } finally {
      setBusy(false);
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
    <main className="min-h-screen bg-background px-6 py-10 text-foreground">
      <div className="mx-auto max-w-5xl">
        <Link to="/operations" className="text-xs underline">← Operations</Link>
        <p className="mt-4 text-xs font-bold uppercase tracking-widest text-muted-foreground">
          CAN OS · Program launch
        </p>
        <h1 className="mt-2 font-serif text-4xl">Host / program launch</h1>
        <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
          Launch a new program on an Organization → Site → Program foundation. A Launch Journey is
          instantiated from configuration; the program can activate only when every blocking
          requirement is complete and the journey is ready.
        </p>
        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-400 p-3">{error}</p>
        )}

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border bg-card p-5">
            <h2 className="font-serif text-2xl">Start a launch</h2>
            {created && (
              <p role="status" className="mt-4 rounded-lg border p-3 text-sm">
                Launch started. Program <code>{created.programId}</code> with Launch Journey{" "}
                <code>{created.journeyId}</code> is now in the checklist below.
              </p>
            )}
            <form className="mt-4 space-y-5" onSubmit={submitLaunch}>
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
          </section>

          <section>
            <h2 className="font-serif text-2xl">Launches in progress</h2>
            <div className="mt-4 space-y-3">
              {launches.launches.map((launch) => {
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
                    <div className="mt-4">
                      <button
                        type="button"
                        className="rounded-lg border px-4 py-2 text-sm font-semibold disabled:opacity-50"
                        disabled={busy || !activatable}
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
      </div>
    </main>
  );
}
