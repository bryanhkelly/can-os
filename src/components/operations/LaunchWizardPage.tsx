import { useSchoolConfigurationNavigation } from "@/components/launch-studio/SchoolConfigurationContext";
import type { LaunchJurisdictionResearch } from "@/domain/jurisdiction-launch-research";
import { launchMilestoneAvailable, type LaunchReadStates } from "@/lib/supplementary-read";
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
import {buildLaunchGuidance, launchResponsibility} from "@/domain/launch-guidance";
import {launchSiteSelectionIssue} from "@/domain/launch-site-selection";
import {listAdmissionsPrograms} from "@/modules/enrollment/admissions-program-directory.functions";
import {SchoolPreparationNavigation} from "@/components/operations/SchoolPreparationNavigation";
import { LaunchStudioShell, JourneyWelcome } from "@/components/launch-studio/LaunchStudioShell";
import { LaunchDraftButton } from "@/components/launch-studio/LaunchDraftButton";
import { useLaunchDraftChanges, useLaunchUnsavedChanges } from "@/components/launch-studio/useLaunchUnsavedChanges";
import { schoolLaunchSteps, launchRequirementProgress } from "@/domain/launch-studio";
import type { LaunchDraftRecord } from "@/domain/launch-draft";
import { useState } from "react";
import { hasEnteredSiteAddress, physicalSiteAddressSchema } from "@/domain/site-setup-configuration";
import { addressStateJurisdiction, launchSiteJurisdictionIssue, siteJurisdictionLocation } from "@/domain/site-jurisdiction-default";
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
 draft?: LaunchDraftRecord | null;
 draftContext?: string;
 reads?: LaunchReadStates;
 options: Awaited<ReturnType<typeof listLaunchOptions>> | null;
 launches: Awaited<ReturnType<typeof listLaunches>> | null;
 preparationPrograms: Awaited<ReturnType<typeof listAdmissionsPrograms>> | null;
 familyInvitations: Awaited<ReturnType<typeof listFamilyInvitations>> | null;
 admissionsCounts: Awaited<ReturnType<typeof getLaunchAdmissionsCounts>> | null;
 enrollmentCounts: Awaited<ReturnType<typeof getActiveEnrollmentCounts>> | null;
 extendedPlanning: Awaited<ReturnType<typeof listExtendedSeasonPlanning>> | null;
 jurisdictionGuidance: Record<string,{summary:string;publishedAt:string|null}>;
 jurisdictionResearch: Record<string,LaunchJurisdictionResearch>;
 jurisdictionResearchUnavailable?: boolean;
 authError: string;
};

export function LaunchWizardPage({ selection, data, hubMode = false }: { hubMode?:boolean; selection: {siteId?: string;programId?: string;step?: (typeof schoolLaunchSteps)[number]}; data: LaunchWizardData }) {

  const { options, launches, preparationPrograms, familyInvitations, admissionsCounts, enrollmentCounts, extendedPlanning, jurisdictionGuidance, jurisdictionResearch, authError } = data;
  const draft = data.draft?.value.audience === "school" ? data.draft.value.fields : undefined;
  const requestedStep = selection.step ?? "welcome";
  const initialProgram = selection.programId
    ? [...(launches?.launches ?? []), ...(preparationPrograms ?? [])].find(item => item.id === selection.programId)
    : undefined;
  const initialSiteId = selection.siteId ?? initialProgram?.siteId ?? draft?.siteId ?? "";
  const navigation=useSchoolConfigurationNavigation();
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
    draft?.type ?? (options?.schoolSetupAdministrator ? "full_school" : "hosted_academy"));
  const [summerCreditBearing, setSummerCreditBearing] = useState(draft?.summerCreditBearing ?? false);
  const creditMode = type === "summer_program" && summerCreditBearing ? "credit_bearing" : isExtendedLearningType(type) ? "non_credit" : "credit_bearing";
  const [name, setName] = useState(draft?.name ?? "");
  const [targetOpeningDate, setTargetOpeningDate] = useState(() => draft?.targetOpeningDate ?? suggestedSchoolYear().startsOn);
  const [slug, setSlug] = useState(draft?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(Boolean(draft?.slug));
  const [gradeMin, setGradeMin] = useState(draft?.gradeMin ?? "K");
  const [gradeMax, setGradeMax] = useState(draft?.gradeMax ?? "12");
  const [onsite, setOnsite] = useState(draft?.onsite ?? true);
  const [asynchronous, setAsynchronous] = useState(draft?.asynchronous ?? false);
  const [liveOnline, setLiveOnline] = useState(draft?.liveOnline ?? false);
  const [onsiteDaysPerWeek, setOnsiteDaysPerWeek] = useState(draft?.onsiteDaysPerWeek ?? "5");
  const [hostOrganizationId, setHostOrganizationId] = useState(
    options?.sites.find(site => site.id === initialSiteId)?.organizationId ?? draft?.hostOrganizationId ?? "");
  const [jurisdictionId, setJurisdictionId] = useState(draft?.jurisdictionId ?? "");
  const [academicProviderOrganizationId, setAcademicProviderOrganizationId] = useState(draft?.academicProviderOrganizationId ?? "");
  const [creditIssuingOrganizationId, setCreditIssuingOrganizationId] = useState(draft?.creditIssuingOrganizationId ?? "");
  const [siteId, setSiteId] = useState(initialSiteId);
  const [newSiteName,setNewSiteName]=useState(draft?.newSiteName ?? "");
  const [createdSiteDraft,setCreatedSiteDraft]=useState<SavedLaunchSiteDraft|null>(null);
  const [newSiteSlug,setNewSiteSlug]=useState(draft?.newSiteSlug ?? "");
  const [newSiteTimezone,setNewSiteTimezone]=useState(draft?.newSiteTimezone ?? "");
  const emptySiteAddress: LaunchSiteAddressDraft = {street1:"",street2:"",city:"",state:"",postalCode:"",country:"US",county:""};
  const [newSiteAddress,setNewSiteAddress]=useState<LaunchSiteAddressDraft>(draft?.newSiteAddress ?? emptySiteAddress);
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
      if(result.publicSiteDraft)setCreatedSiteDraft({siteId:result.siteId,host:result.publicSiteDraft.host,status:result.publicSiteDraft.status,replayed:result.replayed});
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
  const draftFields = { type, summerCreditBearing, name, targetOpeningDate, slug, gradeMin, gradeMax,
    onsite, asynchronous, liveOnline, onsiteDaysPerWeek, hostOrganizationId, jurisdictionId,
    academicProviderOrganizationId, creditIssuingOrganizationId, siteId, newSiteName, newSiteSlug, newSiteTimezone, newSiteAddress };
  const draftChanges = useLaunchDraftChanges(draftFields);
  const [configurationTouched, setConfigurationTouched] = useState(false);
  const releaseNavigation = useLaunchUnsavedChanges(!created && (configurationTouched && draftChanges.dirty || busy));

  async function submitLaunch(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (data.reads && !launchMilestoneAvailable(data.reads, "configuration")) {
      setError("Jurisdiction information is unavailable. Refresh before saving a school Program."); return;
    }
    if(created)return;
    if(onsite&&!siteId){setError("Choose or save a school location before continuing with onsite learning.");return;}
    if(!hostOrganizationId){setError("Choose the organization responsible for your school in step 1.");return;}
    if(!jurisdictionId){setError("Choose your school's state or region in step 1.");return;}
    if(!academicProviderOrganizationId){setError("Choose the organization providing teaching in step 1.");return;}
    if(creditMode==="credit_bearing"&&!creditIssuingOrganizationId){setError("Choose the organization responsible for transcripts in step 1.");return;}
    const selectedSite=options?.sites.find(site=>site.id===siteId);
    const jurisdictionIssue=selectedSite&&options
      ? launchSiteJurisdictionIssue(siteJurisdictionLocation(selectedSite.address,selectedSite.planningLocation),options.jurisdictions,jurisdictionId):null;
    if(jurisdictionIssue?.code==="LAUNCH_LOCATION_MISMATCH"){
      setError(jurisdictionIssue.message);return;
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
      releaseNavigation();
      setCreated({...result,programType:type});
      if (submission.refreshError) setError("Launch started, but the page could not refresh. Reopen its checklist; do not start a duplicate launch.");
      try {
        await router.navigate({
          ...(hubMode ? {to:navigation.modulePath,params:{module:"academics"},search:{programId:result.programId,siteId}} : {to:"/launch/school" as const,search:{programId:result.programId,siteId:result.publicSiteDraft?.siteId,step:"academics" as const}}),
        });
      } catch {
        // startLaunch already committed. Keep the handoff with canonical IDs.
        // A navigation failure must never be presented as failed creation.
        setError("The school launch was saved, but automatic navigation failed. Use its saved launch handoff below, or reopen launch setup; do not start a duplicate Program.");
      }
    } catch (e) {
      setError(mutationErrorMessage(e, "We couldn't save your school. Your entries are still here. If this continues, ask CAN for help before trying again."));
    }
  }

  const {applySchoolModelPreset,applyNinthGradeHybridPreset,applyExtendedLearningPreset}=useLaunchModelPresets({setType,setSummerCreditBearing});

  if (authError || !options || !launches) {
    return (
      <WorkspaceShell width="standard" eyebrow="Program launch" title="Host / program launch">
          <p role="alert" className="mt-8 rounded-lg border p-4 text-sm">
            {authError || "Launch data is unavailable."}
          </p>
      </WorkspaceShell>
    );
  }

  const selectionIssue=launchSiteSelectionIssue(selection,options.sites,[
    ...launches.launches,...(preparationPrograms??[]),
  ]);
  if(selectionIssue)return <WorkspaceShell width="wide" eyebrow="Program launch"
    title="School selection needs attention"
    subtitle="Your requested school context was not changed or replaced with another campus.">
    <p role="alert" className="rounded-lg border p-4 text-sm">
      {selectionIssue==="site_program_mismatch"
        ?"The Site and Program in this link belong to different school contexts."
        :"The saved Site or Program in this link is unavailable to your verified account."}
      {" "}Open a permitted school from Operations, or start a new setup without carrying over this link.
    </p>
    <div className="mt-4 flex flex-wrap gap-4 text-sm">
      <Link to="/home" className="underline">Return to Operations</Link>
      <Link to="/launch/school" search={{}} className="underline">Start a new school setup</Link>
    </div>
  </WorkspaceShell>;
  const currentLaunch=resolveLaunchResume(launches.launches,selection).launch;
  const schools=(preparationPrograms??[]).filter(program=>["draft","launching","ready","active"].includes(program.status));
  // Admissions directory is peripheral to launching a school. Keep its
  // school picker useful from the canonical launch list if that read failed.
  const schoolChoices=[
    ...schools,
    ...launches.launches.filter(launch=>!schools.some(school=>school.id===launch.id))
      .map(launch=>({
        id:launch.id,name:launch.name,siteId:launch.siteId,status:launch.status,
        siteName:options.sites.find(site=>site.id===launch.siteId)?.name??"Site not yet linked",
      })),
  ];
  const currentSchool=resolveLaunchResume(schools,selection).launch;
  const currentProgram=currentSchool??currentLaunch;
  const step = !currentProgram && schoolLaunchSteps.indexOf(requestedStep) > schoolLaunchSteps.indexOf("school")
    ? "school" : requestedStep;
  const schoolSelection={siteId:selection.siteId??currentProgram?.siteId??undefined,programId:selection.programId??currentProgram?.id};
  const hasSchoolPreparation=schools.length>0||launches.launches.length>0;
  const needsSchoolChoice=hasSchoolPreparation&&!currentProgram;
  // All school-readiness recommendations derive from persisted Journey evidence.
  // Never promote Site publication, invitations, or Program status to opening authority.
  const readinessAvailable = !data.reads || launchMilestoneAvailable(data.reads, "opening");
  const readiness = currentLaunch && readinessAvailable ? buildLaunchGuidance(currentLaunch) : null;
  const nextTask = readiness?.nextTask ?? null;
  const needsEvidenceCorrection=nextTask?.evidenceReviewCorrectionPending===true;
  const awaitingCan = !needsEvidenceCorrection && (nextTask?.state==="needs_can" || nextTask?.pendingEvidenceReview===true);
  const waitingExternal = nextTask?.state==="waiting_third_party";
  const pendingSchoolAction = nextTask?.state==="needs_you";
  const blockedTask = nextTask?.state==="blocked";
  const openingReview = nextTask?.action==="opening";
  const nextTitle = !readinessAvailable ? "Readiness information unavailable" : currentSchool?.status==="active"
    ? "Continue school operations"
    : needsSchoolChoice ? "Choose a school to continue"
    : !currentProgram ? "Save your first school Program"
    : !currentLaunch ? "Review your saved school's preparation"
    : needsEvidenceCorrection ? "Evidence correction needed: "+nextTask?.title
    : awaitingCan ? "Waiting for CAN: "+nextTask?.title
    : waitingExternal ? "Waiting for an external requirement: "+nextTask?.title
    : blockedTask ? "Resolve this opening blocker: "+nextTask?.title
    : pendingSchoolAction ? nextTask?.title
    : "Review the current school launch record";
  const nextDescription = !readinessAvailable
    ? "Verify jurisdiction and enrollment information before reviewing readiness. Missing reads are not evidence of zero outstanding work."
    : currentSchool?.status==="active"
    ? "This Program is active. Current onsite opening, staffing, supervision, and custody are checked separately in Operations."
    : needsSchoolChoice ? "Your existing schools are saved. Select the exact school above to continue its own preparation, website, and family outreach without creating a duplicate Program."
    : !currentProgram ? "Save the host Site and academic Program once; return to this same school to continue."
    : !currentLaunch ? "This Program has no available pre-opening Journey here. Review the saved academic and school context; do not infer readiness."
    : nextTask
      ? nextTask.description+(needsEvidenceCorrection
          ? " A correction was requested. Review the recorded rejection and resubmit evidence through the authorized workflow."
          : awaitingCan ? " A submitted requirement awaits institutional review; the school cannot approve it."
          : " Responsible: "+launchResponsibility(nextTask.state)+".")
      : "No actionable task was confirmed from the available Launch Journey. Review the authoritative school record instead of assuming opening approval.";
  function changeStep(id: string) {
    const next = schoolLaunchSteps.find(item => item === id);
    const targetIndex = next ? schoolLaunchSteps.indexOf(next) : -1;
    if (next && (currentProgram || targetIndex <= schoolLaunchSteps.indexOf("school"))) {
      void router.navigate({ to: "/launch/school", search: { ...selection, step: next } });
    }
  }
  const titles = { welcome: "Let's build your school.", school: "Your school, your foundation.",
    academics: "Prepare your academic year.", website: "Introduce your school.",
    families: "Welcome your families.", readiness: "Review what remains.", next: "Your next beginning." };

  return (
    <LaunchStudioShell focused={hubMode} role={hubMode ? "Academic Program" : "School setup"} subject={currentProgram?.name ?? "Your school"}
      title={hubMode ? "Build your academic program." : titles[step]}
      description={hubMode ? "Plan grades and how students will learn. Authorization to open comes later." : "One school, one connected setup. Approvals are reviewed separately."}
      steps={schoolLaunchSteps.map(id => ({ id, title: { welcome: "Welcome", school: "School details",
        academics: "Academics", website: "School website", families: "Families & staff",
        readiness: "Readiness review", next: "What's next" }[id],
        disabled: !currentProgram && !["welcome", "school"].includes(id), }))}
      currentId={step} onStepChange={changeStep}
      progress={currentLaunch && readinessAvailable ? launchRequirementProgress(currentLaunch.requirements) : undefined}
      status={<p>{currentProgram ? nextDescription : "Save a draft to finish later. Save and continue creates your first academic Program; jurisdiction and opening approval are separate."}</p>}
      actions={!hubMode && <>
        <Button type="button" variant="outline" disabled={step === "welcome"}
          onClick={() => changeStep(schoolLaunchSteps[schoolLaunchSteps.indexOf(step) - 1]!)}>Back</Button>
        {step !== "school" && step !== "next" && <Button type="button" disabled={busy}
          onClick={() => changeStep(schoolLaunchSteps[schoolLaunchSteps.indexOf(step) + 1]!)}>
          {step === "welcome" ? "Let's get started" : "Continue"}</Button>}
      </>}
      exit={<div className="flex flex-wrap justify-center gap-5">{siteId && <Link to={navigation.homePath} search={{siteId}} className="font-semibold text-primary">Back to {navigation.homeLabel}</Link>}<Link to="/home" search={schoolSelection} className="underline">Skip to dashboard</Link></div>}>
        {step === "welcome" && <JourneyWelcome summary="Bring your school to life, one clear step at a time. Your Site, academic Program, website and family applications stay connected."
          requirements={["Your school location and time zone", "Your academic model, grade range and intended opening date", "The people who will help prepare your school"]}
          outcome="Save preparation now and return later. CAN services, publication, admissions and legal opening each retain their own review." />}
        {data.reads && <details aria-label="Launch data availability" className="mt-4 border p-4 text-sm"><summary>School information availability</summary>
          {Object.entries(data.reads).map(([name, state]) => <p key={name} role={state === "unavailable" || state === "unauthorized" ? "status" : undefined}>
            {name.replace(/([A-Z])/g, " $1")}: {state === "empty" ? "No records" : state === "ready" ? "Available" : state === "unauthorized" ? "Not authorized" : "Unavailable"}
          </p>)}
          {!readinessAvailable && <Button type="button" variant="ghost" className="mt-2 underline" onClick={() => void router.invalidate()}>Retry launch information</Button>}
        </details>}
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
        {!hubMode && <SchoolPreparationNavigation schools={schoolChoices} selected={schoolChoices.find(school=>school.id===currentProgram?.id)??null} onSelect={school=>void router.navigate({to:"/launch/school",search:{siteId:school.siteId??undefined,programId:school.id,step}})}/> }
        {(step === "welcome" || step === "readiness" || step === "next") && <section aria-label="Your next school launch action" className="mt-5 rounded-2xl border border-primary/20 bg-card p-5">
          <p className="text-xs font-bold uppercase tracking-widest text-primary">Your school · Next action</p>
          <h2 className="mt-2 font-serif text-2xl font-semibold">{nextTitle}</h2>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{nextDescription}</p>
          {currentLaunch && readiness && <p className="mt-3 text-sm">
            <strong>{readiness.pendingBlocking.length} opening blockers</strong> · {readiness.pending.length} incomplete Journey requirements
            {readiness.ready ? " · Journey ready for independent activation checks" : " · Opening is not authorized by this checklist"}
          </p>}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {currentSchool?.status==="active"
              ? <Button asChild><Link to="/home" search={{siteId:currentSchool.siteId,programId:currentSchool.id}}
                  >Open school operations</Link></Button>
              : currentLaunch && pendingSchoolAction && !awaitingCan && nextTask?.requiresRegistrarReview
                ? <Button asChild><Link to="/launch/school/$programId" params={{programId:currentLaunch.id}}
                    search={{siteId:currentLaunch.siteId??undefined,programId:undefined}}
                    >Review evidence requirement</Link></Button>
              : currentLaunch && pendingSchoolAction && !awaitingCan && !openingReview && nextTask?.action==="admissions"
                ? <Button asChild><Link to="/admissions/intake" search={{siteId:currentLaunch.siteId??undefined,programId:currentLaunch.id}}
                    >Review authorized family intake</Link></Button>
              : currentLaunch && pendingSchoolAction && !awaitingCan && nextTask?.action==="orientation"
                ? <Button asChild><Link to="/launch/school/$programId" params={{programId:currentLaunch.id}}
                    search={{siteId:currentLaunch.siteId??undefined,programId:undefined}}
                    >Complete orientation setup</Link></Button>
              : currentLaunch && pendingSchoolAction && !awaitingCan && !openingReview && nextTask?.action==="academics"
                ? <Button asChild><Link to="/launch/school/$programId" params={{programId:currentLaunch.id}}
                    search={{siteId:currentLaunch.siteId??undefined,programId:undefined}}
                    >Continue academic preparation</Link></Button>
              : <Button type="button" onClick={() => changeStep(!currentProgram ? "school" : "readiness")}>
                  {needsSchoolChoice?"Choose a saved school":!currentProgram?"Set up school and Program":!currentLaunch?"Review preparation":needsEvidenceCorrection?"Review requested correction":awaitingCan?"See CAN review status":waitingExternal?"Review external dependency":openingReview?"Review activation checks":blockedTask?"Inspect blocker":"Review next requirement"}
                </Button>}
            {currentLaunch && !isExtendedLearningType(currentLaunch.type) && <Button variant="outline" onClick={() => changeStep("website")}>Prepare website in parallel</Button>}
            {currentLaunch && !isExtendedLearningType(currentLaunch.type) && <Button variant="ghost" onClick={() => changeStep("families")}>Family outreach</Button>}
          </div>
          {(awaitingCan || waitingExternal) && <p className="mt-3 text-xs text-muted-foreground">
            This requirement is not a school-owned approval. Continue permitted preparation while the responsible reviewer or external party acts.
          </p>}
          <p className="mt-3 text-xs text-muted-foreground">This guidance reflects saved Journey requirements, not a live authorization decision. The server separately checks whether the school may open.</p>
          {step === "next" && <div className="mt-4 border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">Need a partnership conversation, financial discussion or general advice? These optional choices do not alter school readiness.</p>
            <Link to="/next/$journeyId" params={{journeyId:"start-a-school"}}
              className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary underline">
              Explore partnership next steps
            </Link>
          </div>}
        </section>}
        <LaunchPreparationWorkspace focus={step} currentLaunch={currentLaunch} currentProgram={currentProgram} currentSchoolStatus={currentSchool?.status} launches={launches.launches} selection={selection} schoolSelection={schoolSelection} hasSchoolPreparation={hasSchoolPreparation} admissionsCounts={admissionsCounts} enrollmentCounts={enrollmentCounts} familyInvitations={familyInvitations} />
        {step === "next" && <details id="launch-portfolio" className="mt-7 rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Saved launches · Journey and academic records</summary>
          <p className="mt-3 text-sm text-muted-foreground">Continue a saved launch in the guided view, or open its academic setup. Journey requirements remain the canonical source; this summary does not duplicate or grant opening approval.</p>
          <LaunchPortfolio launches={launches.launches} sites={options.sites} siteId={selection.siteId} programId={selection.programId}/>
        </details>}
        <div hidden={step !== "school"} onChangeCapture={() => setConfigurationTouched(true)}
          onClickCapture={event => {
            if (event.target instanceof Element && event.target.closest('[aria-pressed]')) setConfigurationTouched(true);
          }}>
        <div className="mt-8 grid gap-6">
          <LaunchDraftButton key={data.draftContext} selection={{ audience: "school", context: data.draftContext ?? ":" }}
            initial={data.draft ?? null} disabled={busy || Boolean(created)} buttonLabel="Save draft"
            successMessage="Draft saved. You can continue later."
            commandErrorMessage="Couldn't save the draft. Your details are still on this page."
            onSaved={value => { if (value.audience === "school") draftChanges.markSaved(value.fields); }}
            value={() => ({ audience: "school", fields: draftFields })} />
          <LaunchConfigurationForm created={created} hasSchoolPreparation={hasSchoolPreparation} modelPresets={{onSchoolModel:applySchoolModelPreset,onNinthGradeHybrid:applyNinthGradeHybridPreset,onExtendedLearning:applyExtendedLearningPreset}} identity={{ type, setType, summerCreditBearing, setSummerCreditBearing, name, setName, targetOpeningDate, setTargetOpeningDate, slug, setSlug, slugEdited, setSlugEdited, gradeMin, setGradeMin, gradeMax, setGradeMax }} delivery={{ onsite, setOnsite, liveOnline, setLiveOnline, asynchronous, setAsynchronous, onsiteDaysPerWeek, setOnsiteDaysPerWeek }} hostAndProvider={{ options, jurisdictionGuidance, jurisdictionResearch, jurisdictionResearchUnavailable:data.jurisdictionResearchUnavailable, hostOrganizationId, setHostOrganizationId, siteId, setSiteId, setCreatedSiteDraft, hostSites, newSiteName, setNewSiteName, newSiteSlug, setNewSiteSlug, newSiteTimezone, setNewSiteTimezone, newSiteAddress, setNewSiteAddress, saveSiteAddress, saveSiteContact, saveSiteIdentity, duplicateNewSite, createdSiteDraft, busy, addSite, jurisdictionId, setJurisdictionId, academicProviderOrganizationId, setAcademicProviderOrganizationId, creditMode, creditIssuingOrganizationId, setCreditIssuingOrganizationId }} submitLaunch={submitLaunch} busy={busy} />

          <details className="rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Optional summer and after-school programs</summary>
           {extendedPlanning?<ExtendedLearningSeasonPlanner planning={extendedPlanning} siteId={selection.siteId}/>:<p role="status" className="mt-3 text-sm">Additional program planning is temporarily unavailable. You can continue setting up your school.</p>}
          </details>
        </div></div>
    </LaunchStudioShell>
  );
}
