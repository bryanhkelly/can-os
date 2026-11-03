import type { LaunchJurisdictionResearch } from "@/domain/jurisdiction-launch-research";
import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useLaunchInstitutionDefaults } from "@/hooks/useLaunchInstitutionDefaults";
import { LaunchConfigurationForm } from "@/components/operations/LaunchConfigurationForm";
import { updateLaunchSiteAddress, updateLaunchSiteContact, updateLaunchSiteIdentity } from "@/modules/programs/site-configuration.functions";
import type { LaunchSiteContactDraft } from "@/components/operations/LaunchSiteContactEditor";
import type { LaunchSiteAddressDraft, SavedLaunchSiteDraft } from "@/components/operations/LaunchHostAndProviderFields";
import type { LaunchCreatedResult } from "@/components/operations/LaunchCreatedHandoff";
import { useLaunchModelPresets } from "@/hooks/useLaunchModelPresets";
import { LaunchPreparationWorkspace } from "@/components/operations/LaunchPreparationWorkspace";
import { useWorkspaceMutation } from "@/hooks/useWorkspaceMutation";
import type { listFamilyInvitations } from "@/modules/enrollment/family-invitations.functions";
import type { getLaunchAdmissionsCounts } from "@/modules/enrollment/launch-admissions-counts.functions";
import type { getActiveEnrollmentCounts } from "@/modules/enrollment/admissions-dashboard.functions";
import {resolveLaunchResume} from "@/domain/launch-resume";
import {launchSiteSelectionIssue} from "@/domain/launch-site-selection";
import {listAdmissionsPrograms} from "@/modules/enrollment/admissions-program-directory.functions";
import {SchoolPreparationNavigation} from "@/components/operations/SchoolPreparationNavigation";
import { WorkflowIntro } from "@/components/workspace/workflow-intro";
import { useEffect, useState } from "react";
import { hasEnteredSiteAddress, physicalSiteAddressSchema } from "@/domain/site-setup-configuration";
import { addressStateJurisdiction } from "@/domain/site-jurisdiction-default";
import { launchGradeRangeIsOrdered } from "@/domain/launch-grade-range";
import { programTypes, isExtendedLearningType } from "@/domain/program-offerings";
import { suggestedSchoolYear } from "@/domain/school-year-defaults";
import { Link, useRouter } from "@tanstack/react-router";
import { WorkspaceShell } from "@/components/workspace";
import { Button } from "@/components/ui/button";
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
 jurisdictionGuidance: Record<string,{summary:string;publishedAt:string|null}>;
 jurisdictionResearch: Record<string,LaunchJurisdictionResearch>;
 authError: string;
};

export function LaunchWizardPage({ selection, data }: { selection: {siteId?: string;programId?: string}; data: LaunchWizardData }) {

  const { options, launches, preparationPrograms, familyInvitations, admissionsCounts, enrollmentCounts, extendedPlanning, jurisdictionGuidance, jurisdictionResearch, authError } = data;
  const router = useRouter();
  const siteMutation = useWorkspaceMutation({ mutationFn: (input: Parameters<typeof createLaunchSite>[0]) => createLaunchSite(input), invalidateRouter: () => router.invalidate() });
  const contactMutation = useWorkspaceMutation({mutationFn:(input:Parameters<typeof updateLaunchSiteContact>[0])=>updateLaunchSiteContact(input),invalidateRouter:()=>router.invalidate()});
  const addressMutation = useWorkspaceMutation({mutationFn:(input:Parameters<typeof updateLaunchSiteAddress>[0])=>updateLaunchSiteAddress(input),invalidateRouter:()=>router.invalidate()});
  const identityMutation = useWorkspaceMutation({mutationFn:(input:Parameters<typeof updateLaunchSiteIdentity>[0])=>updateLaunchSiteIdentity(input),invalidateRouter:()=>router.invalidate()});
  const launchMutation = useWorkspaceMutation({ mutationFn: (input: Parameters<typeof startLaunch>[0]) => startLaunch(input), invalidateRouter: () => router.invalidate() });
  const busy = siteMutation.isSubmitting || contactMutation.isSubmitting || addressMutation.isSubmitting || identityMutation.isSubmitting || launchMutation.isSubmitting ||
    !!siteMutation.refreshError || !!contactMutation.refreshError || !!addressMutation.refreshError || !!identityMutation.refreshError || !!launchMutation.refreshError;
  const [error, setError] = useState("");
  const [created, setCreated] = useState<LaunchCreatedResult | null>(null);
  const [type, setType] = useState<(typeof programTypes)[number]>(
    options?.schoolSetupAdministrator && options.organizations[0]?.type !== "church" ? "full_school" : "church_hosted_academy");
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
  const [createdSiteDraft,setCreatedSiteDraft]=useState<SavedLaunchSiteDraft|null>(null);
  const [newSiteSlug,setNewSiteSlug]=useState("");
  const [newSiteTimezone,setNewSiteTimezone]=useState("");
  useEffect(()=>{
    // Resume by exact Program when URL contains only programId; never carry a
    // different school Site forward from the previous screen.
    const program=selection.programId
      ? [...(launches?.launches??[]),...(preparationPrograms??[])]
          .find(item=>item.id===selection.programId) : undefined;
    const nextSiteId=selection.siteId??program?.siteId??"";
    setSiteId(nextSiteId);
    const selected=options?.sites.find(site=>site.id===nextSiteId);
    if(selected)setHostOrganizationId(selected.organizationId);
    setCreated(null);
    setCreatedSiteDraft(null);
    setName("");
    setSlug("");
    setSlugEdited(false);
  },[selection.siteId,selection.programId]);
  const emptySiteAddress: LaunchSiteAddressDraft = {street1:"",street2:"",city:"",state:"",postalCode:"",country:"US",county:""};
  const [newSiteAddress,setNewSiteAddress]=useState<LaunchSiteAddressDraft>(emptySiteAddress);
  async function retrySiteRefresh(){
    const outcome=await siteMutation.retryRefresh();
    if(outcome.status==="refreshed")setError("");
  }
  async function retryContactRefresh(){
    const outcome=await contactMutation.retryRefresh();
    if(outcome.status==="refreshed")setError("");
  }
  async function retryAddressRefresh(){
    const outcome=await addressMutation.retryRefresh();
    if(outcome.status==="refreshed")setError("");
  }
  async function retryLaunchRefresh(){
    const outcome=await launchMutation.retryRefresh();
    if(outcome.status==="refreshed")setError("");
  }
  async function addSite(){
    if(!hostOrganizationId)return;
    if(!newSiteTimezone){setError("Choose the school location's time zone before saving.");return;}
    const hasAddress=hasEnteredSiteAddress(newSiteAddress);
    if(hasAddress && (!newSiteAddress.street1.trim()||!newSiteAddress.city.trim()||!newSiteAddress.state.trim()||!newSiteAddress.postalCode.trim())) {
      setError("Complete street, city, state and postal code, or leave the location address blank for later.");
      return;
    }
    const addressInput={
      street1:newSiteAddress.street1,
      ...(newSiteAddress.street2.trim()?{street2:newSiteAddress.street2}:{}),
      city:newSiteAddress.city,state:newSiteAddress.state,
      postalCode:newSiteAddress.postalCode,country:newSiteAddress.country||"US",
      ...(newSiteAddress.county.trim()?{county:newSiteAddress.county}:{}),
    };
    const parsedAddress=hasAddress ? physicalSiteAddressSchema.safeParse(addressInput) : null;
    if(parsedAddress && !parsedAddress.success) {
      const issue=parsedAddress.error.issues[0];
      setError(issue?.message??"Enter a valid physical address before saving the Site.");
      return;
    }
    setError("");
    try{
      const submission=await siteMutation.submit({data:{organizationId:hostOrganizationId,name:newSiteName,
        slug:newSiteSlug,timezone:newSiteTimezone,
        ...(parsedAddress?.success ? {address:parsedAddress.data} : {})}});
      if (submission.status === "ignored") return;
      const result = submission.value;
      setCreatedSiteDraft({siteId:result.siteId,host:result.publicSiteDraft.host,status:result.publicSiteDraft.status,replayed:result.replayed});
      setSiteId(result.siteId);
      if (submission.refreshError) setError("Site created, but the page could not refresh. Reopen launch setup; do not create another Site.");
      setNewSiteName("");setNewSiteSlug("");setNewSiteAddress(emptySiteAddress);
      if(parsedAddress?.success && options) {
        const suggested=addressStateJurisdiction(parsedAddress.data,options.jurisdictions);
        if(suggested)setJurisdictionId(suggested);
      }
    }catch(e){setError(mutationErrorMessage(e, "Unable to create site"));}

  }

  async function saveSiteContact(contact:LaunchSiteContactDraft|null,expectedRevision:string) {
    const submission=await contactMutation.submit({data:{siteId,expectedRevision,contact}});
    if(submission.status==="ignored")return;
    if(submission.refreshError) {
      setError("Contact saved, but refresh failed. Retry refresh without saving again.");
      throw new Error("Contact saved. Refresh to see the updated details.");
    }
    setError("Private school contact saved. Public display requires a separate approval.");
  }

  async function saveSiteIdentity(identity:{name:string;timezone:string},expectedRevision:string,changeReason:string) {
    const submission=await identityMutation.submit({data:{siteId,expectedRevision,
      name:identity.name,timezone:identity.timezone,changeReason}});
    if(submission.status==="ignored")return;
    if(submission.refreshError){
      setError("Site identity saved, but the page could not refresh. Retry refresh instead of saving again.");
      throw new Error("Identity saved. Refresh to see the updated school Site.");
    }
    setError("Draft Site identity saved. No public claim or school opening was approved.");
  }

  async function saveSiteAddress(address:LaunchSiteAddressDraft,expectedRevision:string,changeReason:string) {
    const submission=await addressMutation.submit({data:{
      siteId,expectedRevision,changeReason,address:{
        street1:address.street1,street2:address.street2||undefined,city:address.city,
        state:address.state,postalCode:address.postalCode,country:address.country,
        county:address.county||undefined,
      },
    }});
    if(submission.status==="ignored")return;
    if(submission.refreshError) {
      setError("Address saved, but the page could not refresh. Reopen setup before making further changes.");
      throw new Error("Address saved. Refresh the setup page to see the updated location.");
    }
    if(submission.value.reviewRequested)
      setError("Address saved. The affected Program requires independent jurisdiction and opening review.");
    else setError("");
  }

  const hostSites = options?.sites.filter((site) => site.organizationId === hostOrganizationId) ?? [];
  // Recognize an existing campus before the leader accidentally forks it.
  const duplicateNewSite = hostSites.find(site =>
    (newSiteSlug.trim().length > 0 && site.slug === newSiteSlug.trim()) ||
    (newSiteName.trim().length >= 2 && site.name.trim().toLowerCase() === newSiteName.trim().toLowerCase()));

  useLaunchInstitutionDefaults({options,siteId,hostOrganizationId,hostSites,type,creditMode,academicProviderOrganizationId,creditIssuingOrganizationId,jurisdictionId,setHostOrganizationId,setSiteId,setAcademicProviderOrganizationId,setCreditIssuingOrganizationId,setJurisdictionId,strictSelection:Boolean(selection.siteId||selection.programId)});

  async function submitLaunch(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if(created)return;
    if(onsite&&!siteId){setError("Choose or save a school location before continuing with onsite learning.");return;}
    const selectedSite=options?.sites.find(site=>site.id===siteId);
    const addressJurisdiction=selectedSite&&options
      ? addressStateJurisdiction(selectedSite.address,options.jurisdictions):null;
    if(addressJurisdiction && jurisdictionId!==addressJurisdiction){
      setError("The school Program's jurisdiction conflicts with the saved Site's state. Correct the location or jurisdiction, or request a CAN jurisdiction review before launch.");return;
    }
    if(!launchGradeRangeIsOrdered({min:gradeMin,max:gradeMax})){
      setError("Minimum grade must not come after maximum grade.");return;
    }
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
      setError(mutationErrorMessage(e, "Unable to start launch"));
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

  const selectionIssue=launchSiteSelectionIssue(selection,options.sites,[
    ...launches.launches,...(preparationPrograms??[]),
  ]);
  if(selectionIssue)return <WorkspaceShell width="wide" eyebrow="CAN OS · Program launch"
    title="School selection needs attention"
    subtitle="Your requested school context was not changed or replaced with another campus.">
    <p role="alert" className="rounded-lg border p-4 text-sm">
      {selectionIssue==="site_program_mismatch"
        ?"The Site and Program in this link belong to different school contexts."
        :"The saved Site or Program in this link is unavailable to your verified account."}
      {" "}Open a permitted school from Operations, or start a new setup without carrying over this link.
    </p>
    <div className="mt-4 flex flex-wrap gap-4 text-sm">
      <Link to="/operations" className="underline">Return to Operations</Link>
      <Link to="/operations/launch" search={{}} className="underline">Start a new school setup</Link>
    </div>
  </WorkspaceShell>;
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
      actions={<Button asChild variant="outline" size="sm"><Link to="/operations/workflows" search={{siteId:selection.siteId,programId:selection.programId}}>Connected workflows</Link></Button>}>
        <WorkflowIntro eyebrow="School launch · Readiness" title="Build a school with confidence." description="Coordinate the host site, academic provider and program launch. Recorded progress is not permission to open: blocking requirements and approvals remain authoritative." />
        {currentSchool?.status==="active"&&<section aria-label="Transition from launch to operations" className="mt-5 rounded-2xl border border-primary/30 bg-card p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Launch → Run</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold">Continue running {currentSchool.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Your school Program is active. Use the operations workspace for current work, including staffing and enrollment follow-ups. Keep setup here for website content, invitations and additional preparation. Daily opening authority and physical site readiness are checked separately.</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link to="/operations" search={{siteId:currentSchool.siteId,programId:currentSchool.id}}
              className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Open school operations →</Link>
            <Link to="/site/day" className="inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-semibold">Site Today (site staff)</Link>
          </div>
        </section>}
        {currentSchool&&currentSchool.status!=="active"&&<section aria-label="Launch progress and next workspace" className="mt-5 rounded-2xl border bg-card p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Launch · Preparing</p>
          <h2 className="mt-2 font-serif text-xl font-semibold">Continue setting up {currentSchool.name}</h2>
          <p className="mt-2 text-sm text-muted-foreground">Use the steps below for academics, family outreach, website and opening evidence. Finishing these steps does not independently authorize receiving students. Operations is available for separately permitted work without ending setup.</p>
          <Link to="/operations" search={{siteId:currentSchool.siteId,programId:currentSchool.id}} className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">View operations and pending actions →</Link>
        </section>}
        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-destructive p-3">{error}</p>
        )}
        {siteMutation.refreshError&&<Button type="button" variant="outline" size="sm" disabled={siteMutation.isSubmitting}
          onClick={()=>void retrySiteRefresh()} className="mt-2">
          Retry Site refresh
        </Button>}
        {contactMutation.refreshError&&<Button type="button" variant="outline" size="sm" disabled={contactMutation.isSubmitting}
          onClick={()=>void retryContactRefresh()} className="mt-2">
          Retry contact refresh
        </Button>}
        {addressMutation.refreshError&&<Button type="button" variant="outline" size="sm" disabled={addressMutation.isSubmitting}
          onClick={()=>void retryAddressRefresh()} className="mt-2">
          Retry address refresh
        </Button>}
        {identityMutation.refreshError&&<Button type="button" variant="outline" size="sm" disabled={identityMutation.isSubmitting}
          onClick={()=>void identityMutation.retryRefresh()} className="mt-2">
          Retry Site identity refresh
        </Button>}
        {launchMutation.refreshError&&<Button type="button" variant="outline" size="sm" disabled={launchMutation.isSubmitting}
          onClick={()=>void retryLaunchRefresh()} className="mt-2">
          Retry launch refresh
        </Button>}
        <section aria-label="Your next school launch action" className="mt-5 rounded-2xl border border-primary/20 bg-card p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Your next step</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold">{currentSchool?.status==="active"
            ? "Continue operating your school"
            : currentProgram ? "Prepare your school's public website"
            : "Save your first school Program"}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{currentSchool?.status==="active"
            ? "Your Program is active. Daily staffing, opening and student custody still have their own authorization checks."
            : currentProgram
              ? "Your school context is saved. Review its approved content and family-facing website while academic and legal readiness continue independently."
              : "Start with the church and physical Site, then save the academic Program once. Return here to complete website, family outreach and opening requirements."}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {currentSchool?.status==="active"
              ? <Link to="/operations" search={{siteId:currentSchool.siteId,programId:currentSchool.id}} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Open school operations</Link>
              : <a href={currentProgram?"#launch-website":"#new-school-launch"} className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">{currentProgram?"Review and prepare website":"Set up school and Program"}</a>}
            {currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<a href="#invite-families" className="inline-flex min-h-11 items-center rounded-xl border px-4 py-2 text-sm font-semibold">Prepare family outreach</a>}
            {currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<a href="#launch-services" className="inline-flex min-h-11 items-center text-sm font-semibold underline">Review opening requirements</a>}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">Configured, approved, published, reachable and authorized to operate are distinct states. No action on this page bypasses the owning service.</p>
        </section>
        <SchoolPreparationNavigation schools={schools} selected={currentSchool} onSelect={school=>void router.navigate({to:"/operations/launch",search:{siteId:school.siteId,programId:school.id}})}/>
        <LaunchPreparationWorkspace currentLaunch={currentLaunch} currentProgram={currentProgram} currentSchoolStatus={currentSchool?.status} launches={launches.launches} selection={selection} schoolSelection={schoolSelection} hasSchoolPreparation={hasSchoolPreparation} admissionsCounts={admissionsCounts} enrollmentCounts={enrollmentCounts} familyInvitations={familyInvitations} />
        <details id="launch-portfolio" className="mt-7 rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Saved launches · Journey and academic records</summary>
          <p className="mt-3 text-sm text-muted-foreground">Continue a saved launch in the guided view, or open its academic setup. Journey requirements remain the canonical source; this summary does not duplicate or grant opening approval.</p>
          <LaunchPortfolio launches={launches.launches} sites={options.sites} siteId={selection.siteId} programId={selection.programId}/>
        </details>
        <div className="mt-8 grid gap-6">
          <LaunchConfigurationForm created={created} hasSchoolPreparation={hasSchoolPreparation} modelPresets={{onSchoolModel:applySchoolModelPreset,onNinthGradeHybrid:applyNinthGradeHybridPreset,onExtendedLearning:applyExtendedLearningPreset}} identity={{ type, setType, summerCreditBearing, setSummerCreditBearing, name, setName, targetOpeningDate, setTargetOpeningDate, slug, setSlug, slugEdited, setSlugEdited, gradeMin, setGradeMin, gradeMax, setGradeMax }} delivery={{ onsite, setOnsite, liveOnline, setLiveOnline, asynchronous, setAsynchronous, onsiteDaysPerWeek, setOnsiteDaysPerWeek }} hostAndProvider={{ options, jurisdictionGuidance, jurisdictionResearch, hostOrganizationId, setHostOrganizationId, siteId, setSiteId, setCreatedSiteDraft, hostSites, newSiteName, setNewSiteName, newSiteSlug, setNewSiteSlug, newSiteTimezone, setNewSiteTimezone, newSiteAddress, setNewSiteAddress, saveSiteAddress, saveSiteContact, saveSiteIdentity, duplicateNewSite, createdSiteDraft, busy, addSite, jurisdictionId, setJurisdictionId, academicProviderOrganizationId, setAcademicProviderOrganizationId, creditMode, creditIssuingOrganizationId, setCreditIssuingOrganizationId }} submitLaunch={submitLaunch} busy={busy} />

          <details className="rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Optional summer and after-school programs</summary>
           {extendedPlanning?<ExtendedLearningSeasonPlanner planning={extendedPlanning} siteId={selection.siteId}/>:<p role="status" className="mt-3 text-sm">Additional program planning is temporarily unavailable. You can continue setting up your school.</p>}
          </details>
        </div>
    </WorkspaceShell>
  );
}
