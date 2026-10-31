import { LaunchPreparationWorkspace } from "@/components/operations/LaunchPreparationWorkspace";
import { LaunchHostAndProviderFields } from "@/components/operations/LaunchHostAndProviderFields";
import { LaunchProgramIdentityFields } from "@/components/operations/LaunchProgramIdentityFields";
import { LaunchDeliveryModelFields } from "@/components/operations/LaunchDeliveryModelFields";
import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import { LaunchSchoolModelPicker } from "@/components/operations/LaunchSchoolModelPicker";
import type { listFamilyInvitations } from "@/modules/enrollment/family-invitations.functions";
import type { listAdmissionsIntake } from "@/modules/enrollment/admissions-intake.functions";
import type { getActiveEnrollmentCounts } from "@/modules/enrollment/admissions-dashboard.functions";
import {resolveLaunchResume} from "@/domain/launch-resume";
import {listAdmissionsPrograms} from "@/modules/enrollment/admissions-program-directory.functions";
import {SchoolPreparationNavigation} from "@/components/operations/SchoolPreparationNavigation";
import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { useEffect, useState } from "react";
import { programTypes, isExtendedLearningType } from "@/domain/program-offerings";
import { suggestedLaunchInstitutions } from "@/domain/launch-institution-defaults";
import { suggestedSchoolYear } from "@/domain/school-year-defaults";
import { Link, useRouter } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { LaunchPortfolio } from "@/components/operations/LaunchPortfolio";
import { ExtendedLearningSeasonPlanner } from "@/components/operations/ExtendedLearningSeasonPlanner";
import type { listExtendedSeasonPlanning } from "@/modules/activities/extended-learning.functions";
import {
  type listLaunches,
  type listLaunchOptions,
  startLaunch,
  createLaunchSite,
} from "@/modules/programs/launch.functions";

export type LaunchWizardData = {
 options: Awaited<ReturnType<typeof listLaunchOptions>> | null;
 launches: Awaited<ReturnType<typeof listLaunches>> | null;
 preparationPrograms: Awaited<ReturnType<typeof listAdmissionsPrograms>> | null;
 familyInvitations: Awaited<ReturnType<typeof listFamilyInvitations>> | null;
 admissions: Awaited<ReturnType<typeof listAdmissionsIntake>> | null;
 enrollmentCounts: Awaited<ReturnType<typeof getActiveEnrollmentCounts>> | null;
 extendedPlanning: Awaited<ReturnType<typeof listExtendedSeasonPlanning>> | null;
 authError: string;
};

export function LaunchWizardPage({ selection, data }: { selection: {siteId?: string;programId?: string}; data: LaunchWizardData }) {

  const { options, launches, preparationPrograms, familyInvitations, admissions, enrollmentCounts, extendedPlanning, authError } = data;
  const router = useRouter();
  const siteMutation = useWorkspaceMutation({ mutationFn: (input: Parameters<typeof createLaunchSite>[0]) => createLaunchSite(input) });
  const launchMutation = useWorkspaceMutation({ mutationFn: (input: Parameters<typeof startLaunch>[0]) => startLaunch(input) });
  const busy = siteMutation.isPending || launchMutation.isPending;
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
  const [type, setType] = useState<(typeof programTypes)[number]>("church_hosted_academy");
  const [summerCreditBearing, setSummerCreditBearing] = useState(false);
  const creditMode = type === "summer_program" && summerCreditBearing ? "credit_bearing" : isExtendedLearningType(type) ? "non_credit" : "credit_bearing";
  const [name, setName] = useState("");
  const [targetOpeningDate, setTargetOpeningDate] = useState(() => suggestedSchoolYear().startsOn);
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
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
  async function addSite(){
    if(!hostOrganizationId)return;
    setError("");
    try{
      const result=await siteMutation.submit({data:{organizationId:hostOrganizationId,name:newSiteName,
        slug:newSiteSlug,timezone:newSiteTimezone}});
      if (!result) return;
      setCreatedSiteDraft({siteId:result.siteId,host:result.publicSiteDraft.host});
      setSiteId(result.siteId);
      await router.invalidate();setNewSiteName("");setNewSiteSlug("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to create site");}

  }

  const hostSites = options?.sites.filter((site) => site.organizationId === hostOrganizationId) ?? [];
  // Recognize an existing campus before the leader accidentally forks it.
  const duplicateNewSite = hostSites.find(site =>
    (newSiteSlug.trim().length > 0 && site.slug === newSiteSlug.trim()) ||
    (newSiteName.trim().length >= 2 && site.name.trim().toLowerCase() === newSiteName.trim().toLowerCase()));

  // Turnkey defaults: when the registrar grant covers exactly one church, and
  // that church has exactly one Site, preselect both instead of asking the
  // leader to find records the system already knows. Selections stay editable.
  useEffect(() => {
    if (!options) return;
    const selectedSite = options.sites.find(site => site.id === siteId);
    if (!hostOrganizationId && selectedSite) {
      setHostOrganizationId(selectedSite.organizationId);
      return;
    }
    const [onlyOrganization] = options.organizations;
    if (!hostOrganizationId && options.organizations.length === 1 && onlyOrganization) {
      setHostOrganizationId(onlyOrganization.id);
    }
  }, [options, hostOrganizationId, siteId]);
  useEffect(() => {
    const [onlySite] = hostSites;
    if (siteId || !hostOrganizationId) return;
    if (hostSites.length === 1 && onlySite) setSiteId(onlySite.id);
  }, [hostSites, hostOrganizationId, siteId]);

  useEffect(() => {
    if (!options) return;
    const suggested = suggestedLaunchInstitutions({
      type, creditMode, providers: options.academicProviderOrganizations,
      issuers: options.creditIssuingOrganizations,
      selectedProviderId: academicProviderOrganizationId,
    });
    if (!academicProviderOrganizationId && suggested.providerId)
      setAcademicProviderOrganizationId(suggested.providerId);
    if (!creditIssuingOrganizationId && suggested.issuerId)
      setCreditIssuingOrganizationId(suggested.issuerId);
    if (!jurisdictionId && options.jurisdictions.length === 1)
      setJurisdictionId(options.jurisdictions[0]!.id);
  }, [options, type, creditMode, academicProviderOrganizationId, creditIssuingOrganizationId, jurisdictionId]);

  async function submitLaunch(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setCreated(null);
    try {
      const result = await launchMutation.submit({
        data: {
          name,
          targetOpeningDate,
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
      if (!result) return;
      setCreated({...result,programType:type});
      await router.invalidate();
      await router.navigate({
        to: "/operations/launch",
        search: { programId: result.programId, siteId: result.publicSiteDraft?.siteId },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start launch");
    }
  }

  function applySchoolModelPreset(model:"elementary"|"middle"|"high"|"k12"|"micro"|"hybrid") {
    const presets={
      elementary:{type:"church_hosted_academy",min:"K",max:"5",days:"5",async:false},
      middle:{type:"church_hosted_academy",min:"6",max:"8",days:"5",async:false},
      high:{type:"church_hosted_academy",min:"9",max:"12",days:"5",async:false},
      k12:{type:"full_school",min:"K",max:"12",days:"5",async:false},
      micro:{type:"microschool",min:"K",max:"8",days:"4",async:true},
      hybrid:{type:"hybrid_program",min:"6",max:"12",days:"2",async:true},
    } as const;
    const choice=presets[model];
    setType(choice.type);setGradeMin(choice.min);setGradeMax(choice.max);
    setOnsite(true);setOnsiteDaysPerWeek(choice.days);setAsynchronous(choice.async);setLiveOnline(false);
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

  const currentLaunch=resolveLaunchResume(launches.launches,selection).launch;
  const schools=(preparationPrograms??[]).filter(program=>["draft","launching","ready","active"].includes(program.status));
  const currentSchool=resolveLaunchResume(schools,selection).launch;
  const currentProgram=currentSchool??currentLaunch;
  const schoolSelection={siteId:selection.siteId??currentProgram?.siteId??undefined,programId:selection.programId??currentProgram?.id};
  const hasSchoolPreparation=schools.length>0||launches.launches.length>0;
  return (
    <WorkspaceShell width="wide" eyebrow="CAN OS · Program launch" title="Open Your School"
      subtitle="Set up your school, invite families, publish your school page, and see exactly what remains before opening."
      breadcrumbs={<><Link to="/operations" search={{siteId:selection.siteId,programId:selection.programId}} className="underline">Operations</Link><span>/</span><span>Program launches</span></>}
      actions={<Link to="/operations/workflows" search={{siteId:selection.siteId,programId:selection.programId}} className="rounded-lg border px-3 py-2 text-sm">Connected workflows</Link>}>
        <WorkflowIntro eyebrow="School launch · Readiness" title="Build a school with confidence." description="Coordinate the host site, academic provider and program launch. Recorded progress is not permission to open: blocking requirements and approvals remain authoritative." />
        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-destructive p-3">{error}</p>
        )}
        <SchoolPreparationNavigation schools={schools} selected={currentSchool} onSelect={school=>void router.navigate({to:"/operations/launch",search:{siteId:school.siteId,programId:school.id}})}/>
        <LaunchPreparationWorkspace currentLaunch={currentLaunch} currentProgram={currentProgram} currentSchoolStatus={currentSchool?.status} launches={launches.launches} selection={selection} schoolSelection={schoolSelection} hasSchoolPreparation={hasSchoolPreparation} admissions={admissions} enrollmentCounts={enrollmentCounts} familyInvitations={familyInvitations} />
        <details className="mt-7 rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Advanced · Launch portfolio and detailed records</summary>
          <LaunchPortfolio launches={launches.launches} sites={options.sites} siteId={selection.siteId} programId={selection.programId}/>
        </details>
        <div className="mt-8 grid gap-6">
          {extendedPlanning ? <ExtendedLearningSeasonPlanner planning={extendedPlanning} siteId={selection.siteId} /> : <p role="status" className="rounded-lg border p-3 text-sm">Extended-learning planning is unavailable. Verify database migrations 0032–0033; school launches remain accessible.</p>}
          <details id="new-school-launch" className="rounded-xl border bg-card p-5" open={!hasSchoolPreparation}>
            <summary className="cursor-pointer text-lg font-semibold">Launch a school · School Basics</summary>
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
            <LaunchSchoolModelPicker onSchoolModel={applySchoolModelPreset} onNinthGradeHybrid={applyNinthGradeHybridPreset} onExtendedLearning={applyExtendedLearningPreset} />
            <form className="mt-4 space-y-5" onSubmit={submitLaunch}>
              <LaunchProgramIdentityFields {...{ type, setType, summerCreditBearing, setSummerCreditBearing, name, setName, targetOpeningDate, setTargetOpeningDate, slug, setSlug, slugEdited, setSlugEdited, gradeMin, setGradeMin, gradeMax, setGradeMax }} />

              <LaunchDeliveryModelFields {...{ onsite, setOnsite, liveOnline, setLiveOnline, asynchronous, setAsynchronous, onsiteDaysPerWeek, setOnsiteDaysPerWeek }} />

              <LaunchHostAndProviderFields {...{ options, hostOrganizationId, setHostOrganizationId, siteId, setSiteId, setCreatedSiteDraft, hostSites, newSiteName, setNewSiteName, newSiteSlug, setNewSiteSlug, newSiteTimezone, setNewSiteTimezone, duplicateNewSite, createdSiteDraft, busy, addSite, jurisdictionId, setJurisdictionId, academicProviderOrganizationId, setAcademicProviderOrganizationId, creditMode, creditIssuingOrganizationId, setCreditIssuingOrganizationId }} />

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

        </div>
    </WorkspaceShell>
  );
}
