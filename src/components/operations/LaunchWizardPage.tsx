import { useLaunchInstitutionDefaults } from "@/hooks/useLaunchInstitutionDefaults";
import { LaunchConfigurationForm } from "@/components/operations/LaunchConfigurationForm";
import type { LaunchCreatedResult } from "@/components/operations/LaunchCreatedHandoff";
import { useLaunchModelPresets } from "@/hooks/useLaunchModelPresets";
import { LaunchPreparationWorkspace } from "@/components/operations/LaunchPreparationWorkspace";
import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import type { listFamilyInvitations } from "@/modules/enrollment/family-invitations.functions";
import type { getLaunchAdmissionsCounts } from "@/modules/enrollment/launch-admissions-counts.functions";
import type { getActiveEnrollmentCounts } from "@/modules/enrollment/admissions-dashboard.functions";
import {resolveLaunchResume} from "@/domain/launch-resume";
import {listAdmissionsPrograms} from "@/modules/enrollment/admissions-program-directory.functions";
import {SchoolPreparationNavigation} from "@/components/operations/SchoolPreparationNavigation";
import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { useState } from "react";
import { programTypes, isExtendedLearningType } from "@/domain/program-offerings";
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
 admissionsCounts: Awaited<ReturnType<typeof getLaunchAdmissionsCounts>> | null;
 enrollmentCounts: Awaited<ReturnType<typeof getActiveEnrollmentCounts>> | null;
 extendedPlanning: Awaited<ReturnType<typeof listExtendedSeasonPlanning>> | null;
 authError: string;
};

export function LaunchWizardPage({ selection, data }: { selection: {siteId?: string;programId?: string}; data: LaunchWizardData }) {

  const { options, launches, preparationPrograms, familyInvitations, admissionsCounts, enrollmentCounts, extendedPlanning, authError } = data;
  const router = useRouter();
  const siteMutation = useWorkspaceMutation({ mutationFn: (input: Parameters<typeof createLaunchSite>[0]) => createLaunchSite(input), invalidateRouter: () => router.invalidate() });
  const launchMutation = useWorkspaceMutation({ mutationFn: (input: Parameters<typeof startLaunch>[0]) => startLaunch(input), invalidateRouter: () => router.invalidate() });
  const busy = siteMutation.isSubmitting || launchMutation.isSubmitting;
  const [error, setError] = useState("");
  const [created, setCreated] = useState<LaunchCreatedResult | null>(null);
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
      const submission=await siteMutation.submit({data:{organizationId:hostOrganizationId,name:newSiteName,
        slug:newSiteSlug,timezone:newSiteTimezone}});
      if (submission.status === "ignored") return;
      const result = submission.value;
      setCreatedSiteDraft({siteId:result.siteId,host:result.publicSiteDraft.host});
      setSiteId(result.siteId);
      if (submission.refreshError) setError("Site created, but the page could not refresh. Reopen launch setup; do not create another Site.");
      setNewSiteName("");setNewSiteSlug("");
    }catch(e){setError(e instanceof Error?e.message:"Unable to create site");}

  }

  const hostSites = options?.sites.filter((site) => site.organizationId === hostOrganizationId) ?? [];
  // Recognize an existing campus before the leader accidentally forks it.
  const duplicateNewSite = hostSites.find(site =>
    (newSiteSlug.trim().length > 0 && site.slug === newSiteSlug.trim()) ||
    (newSiteName.trim().length >= 2 && site.name.trim().toLowerCase() === newSiteName.trim().toLowerCase()));

  useLaunchInstitutionDefaults({options,siteId,hostOrganizationId,hostSites,type,creditMode,academicProviderOrganizationId,creditIssuingOrganizationId,jurisdictionId,setHostOrganizationId,setSiteId,setAcademicProviderOrganizationId,setCreditIssuingOrganizationId,setJurisdictionId});

  async function submitLaunch(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setCreated(null);
    try {
      const submission = await launchMutation.submit({
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
      if (submission.status === "ignored") return;
      const result = submission.value;
      setCreated({...result,programType:type});
      if (submission.refreshError) setError("Launch started, but the page could not refresh. Reopen its checklist; do not start a duplicate launch.");
      try {
        await router.navigate({
          to: "/operations/launch",
          search: { programId: result.programId, siteId: result.publicSiteDraft?.siteId },
        });
      } catch {
        // startLaunch already committed. Keep the handoff with canonical IDs.
        // A navigation failure must never be presented as failed creation.
        setError("The school launch was saved, but automatic navigation failed. Use its saved launch handoff below, or reopen launch setup; do not start a duplicate Program.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to start launch");
    }
  }

  const {applySchoolModelPreset,applyNinthGradeHybridPreset,applyExtendedLearningPreset}=useLaunchModelPresets({setType,setGradeMin,setGradeMax,setOnsite,setOnsiteDaysPerWeek,setAsynchronous,setLiveOnline,setSummerCreditBearing});

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
        <LaunchPreparationWorkspace currentLaunch={currentLaunch} currentProgram={currentProgram} currentSchoolStatus={currentSchool?.status} launches={launches.launches} selection={selection} schoolSelection={schoolSelection} hasSchoolPreparation={hasSchoolPreparation} admissionsCounts={admissionsCounts} enrollmentCounts={enrollmentCounts} familyInvitations={familyInvitations} />
        <details className="mt-7 rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Advanced · Launch portfolio and detailed records</summary>
          <LaunchPortfolio launches={launches.launches} sites={options.sites} siteId={selection.siteId} programId={selection.programId}/>
        </details>
        <div className="mt-8 grid gap-6">
          {extendedPlanning ? <ExtendedLearningSeasonPlanner planning={extendedPlanning} siteId={selection.siteId} /> : <p role="status" className="rounded-lg border p-3 text-sm">Extended-learning planning is unavailable. Verify database migrations 0032–0033; school launches remain accessible.</p>}
          <LaunchConfigurationForm created={created} hasSchoolPreparation={hasSchoolPreparation} modelPresets={{onSchoolModel:applySchoolModelPreset,onNinthGradeHybrid:applyNinthGradeHybridPreset,onExtendedLearning:applyExtendedLearningPreset}} identity={{ type, setType, summerCreditBearing, setSummerCreditBearing, name, setName, targetOpeningDate, setTargetOpeningDate, slug, setSlug, slugEdited, setSlugEdited, gradeMin, setGradeMin, gradeMax, setGradeMax }} delivery={{ onsite, setOnsite, liveOnline, setLiveOnline, asynchronous, setAsynchronous, onsiteDaysPerWeek, setOnsiteDaysPerWeek }} hostAndProvider={{ options, hostOrganizationId, setHostOrganizationId, siteId, setSiteId, setCreatedSiteDraft, hostSites, newSiteName, setNewSiteName, newSiteSlug, setNewSiteSlug, newSiteTimezone, setNewSiteTimezone, duplicateNewSite, createdSiteDraft, busy, addSite, jurisdictionId, setJurisdictionId, academicProviderOrganizationId, setAcademicProviderOrganizationId, creditMode, creditIssuingOrganizationId, setCreditIssuingOrganizationId }} submitLaunch={submitLaunch} busy={busy} />

        </div>
    </WorkspaceShell>
  );
}
