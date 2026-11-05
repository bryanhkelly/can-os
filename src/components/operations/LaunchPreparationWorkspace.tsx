import { Link } from "@tanstack/react-router";
import { OneHourSchoolLaunch } from "@/components/operations/OneHourSchoolLaunch";
import { LaunchAcademicYearStep } from "@/components/operations/LaunchAcademicYearStep";
import { LaunchWebsiteStep } from "@/components/operations/LaunchWebsiteStep";
import { ProgramSiteAuthorizationPanel } from "@/components/operations/ProgramSiteAuthorizationPanel";
import { SchoolJurisdictionReviewPanel } from "@/components/operations/SchoolJurisdictionReviewPanel";
import { LaunchFamilyProgress } from "@/components/operations/LaunchFamilyProgress";
import { isExtendedLearningType } from "@/domain/program-offerings";
import type { listLaunches } from "@/modules/programs/launch.functions";
import type { listFamilyInvitations } from "@/modules/enrollment/family-invitations.functions";
import type { getLaunchAdmissionsCounts } from "@/modules/enrollment/launch-admissions-counts.functions";
import type { getActiveEnrollmentCounts } from "@/modules/enrollment/admissions-dashboard.functions";

type Launch = Awaited<ReturnType<typeof listLaunches>>["launches"][number];

export function LaunchPreparationWorkspace({ focus, currentLaunch, currentProgram, currentSchoolStatus, launches, selection, schoolSelection, hasSchoolPreparation, admissionsCounts, enrollmentCounts, familyInvitations }: {
  focus: "welcome" | "school" | "academics" | "website" | "families" | "readiness" | "next";
  currentLaunch: Launch | null;
  currentProgram: { id: string } | null;
  currentSchoolStatus?: string;
  launches: Launch[];
  selection: { siteId?: string; programId?: string };
  schoolSelection: { siteId?: string; programId?: string };
  hasSchoolPreparation: boolean;
  admissionsCounts: Awaited<ReturnType<typeof getLaunchAdmissionsCounts>> | null;
  enrollmentCounts: Awaited<ReturnType<typeof getActiveEnrollmentCounts>> | null;
  familyInvitations: Awaited<ReturnType<typeof listFamilyInvitations>> | null;
}) {
  const scopedInvitationTimes=currentLaunch&&familyInvitations
    ? familyInvitations.batches.filter(batch=>batch.programId===currentLaunch.id&&batch.siteId===currentLaunch.siteId)
      .map(batch=>new Date(batch.createdAt).getTime()).filter(Number.isFinite).sort((a,b)=>a-b)
    : [];
  const firstInvitationTime=scopedInvitationTimes[0];
  const launchStart=currentLaunch?new Date(currentLaunch.createdAt).getTime():NaN;
  const recordedOutreachMinutes=firstInvitationTime!==undefined&&Number.isFinite(launchStart)&&firstInvitationTime>=launchStart
    ? Math.floor((firstInvitationTime-launchStart)/60000):null;
  return <>
        {focus === "readiness" && currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<details aria-label="Measured launch setup" className="mt-5 rounded-xl border bg-card p-5"><summary className="cursor-pointer text-sm font-semibold">Setup timing and saved milestones</summary>
          <h2 className="font-serif text-xl">Recorded launch start</h2>
          <p className="mt-2 text-sm">Program creation: <time dateTime={currentLaunch.createdAt}>{new Date(currentLaunch.createdAt).toLocaleString()}</time>.</p>
          {firstInvitationTime!==undefined&&<p className="mt-2 text-sm">First saved invitation batch: <time dateTime={new Date(firstInvitationTime).toISOString()}>{new Date(firstInvitationTime).toLocaleString()}</time>.</p>}
          {recordedOutreachMinutes!==null&&<p className="mt-2 text-sm" role="status">Elapsed from Program creation to first saved outreach batch: <strong>{recordedOutreachMinutes} whole minutes</strong>. This includes unmeasured waiting and is not hands-on setup time or evidence of inbox delivery.</p>}
          {firstInvitationTime===undefined&&<p className="mt-2 text-sm">No saved invitation batch timestamp is available for this Program and Site; elapsed outreach time is not yet measurable.</p>}
          {firstInvitationTime!==undefined&&recordedOutreachMinutes===null&&<p role="alert" className="mt-2 text-sm">Saved invitation timestamp cannot be reconciled with Program creation; no elapsed time is reported.</p>}
          {currentLaunch.journey?.status==="ready"&&<p className="mt-2 text-sm">Independent review of opening is the next institutional handoff; journey readiness is not an opening timestamp.</p>}
          <p className="mt-2 text-xs text-muted-foreground">This timestamp is from the saved Program, not a browser stopwatch. No completion duration is claimed until a separately persisted completion or opening event is available. CAN review, hosting and third-party response time cannot be counted as school-controlled setup time without independently timestamped events.</p>
        </details>}
        {focus === "readiness" && currentSchoolStatus!=="active"&&<div id="launch-requirements" className="scroll-mt-6">
          <OneHourSchoolLaunch key={currentLaunch?.id??`${selection.siteId??""}:${selection.programId??""}`}
            launches={launches} selectedProgramId={currentLaunch?.id??selection.programId}
            selectedSiteId={currentLaunch?.siteId??selection.siteId}/>
        </div>}
        {focus === "readiness" && currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<div id="launch-services" className="scroll-mt-6">
          <SchoolJurisdictionReviewPanel key={`jurisdiction-review-${currentLaunch.id}`} programId={currentLaunch.id}/>
          <ProgramSiteAuthorizationPanel key={`site-authorization-${currentLaunch.id}`} programId={currentLaunch.id}/>
          <p className="mt-3 text-sm text-muted-foreground">You can prepare the academic year, website and family outreach while CAN reviews the requested services. Each service, admissions and school opening retain their own authorization checks.</p>
          <Link to="/launch/school" search={{ ...schoolSelection, step: "academics" }} className="mt-2 inline-block text-sm font-semibold underline">Continue planning your academic year →</Link>
        </div>}
        {focus === "academics" && currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<LaunchAcademicYearStep programId={currentLaunch.id}/>}
        {focus === "academics" && currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<section id="launch-first-class" className="mt-5 scroll-mt-6 rounded-xl border bg-card p-5" aria-label="Prepare your first classroom">
          <h2 className="font-serif text-2xl">Prepare your first classroom</h2>
          <p className="mt-2 text-sm text-muted-foreground">Use the real published curriculum, scheduled term and CAN-authorized instructor. The academic setup will suggest the first eligible course and a matching schedule, then independently verify credentials and service authorization before allowing assignment. Preparing a class never opens the school.</p>
          <Link to="/launch/school/$programId" params={{programId:currentLaunch.id}} search={{siteId:currentLaunch.siteId??undefined,programId:undefined}} className="mt-3 inline-block text-sm font-semibold underline">Review guided academic setup →</Link>
          <p className="mt-2 text-xs text-muted-foreground">If the first classroom is still blocked, review the launch task and its named prerequisite rather than creating a placeholder course or teacher.</p>
        </section>}
        {focus === "website" && currentProgram&&<LaunchWebsiteStep programId={currentProgram.id}/>}

        {focus === "families" && currentProgram&&<details className="mt-4 rounded-xl border bg-card p-4" open>
          <summary className="cursor-pointer text-sm font-semibold">Choose who helps prepare your school</summary>
          <p className="mt-2 text-sm text-muted-foreground">An authorized administrator can invite a school registrar to complete setup, or a website editor to prepare church-owned content. Choose the exact Site in the invitation workspace. Access starts only after secure email acceptance; institutional approval remains separate.</p>
          <nav aria-label="School launch staff invitations" className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
            <Link to="/admin" search={{siteId:schoolSelection.siteId,inviteRole:"registrar"}} className="underline">Invite a school setup lead</Link>
            <Link to="/admin" search={{siteId:schoolSelection.siteId,inviteRole:"site_website_editor"}} className="underline">Invite a church website editor</Link>
          </nav>
        </details>}

        {focus === "families" && hasSchoolPreparation && currentProgram && <section id="invite-families" className="scroll-mt-6" aria-label="Invite families and review admissions progress"><LaunchFamilyProgress
          admissionsCounts={admissionsCounts}
          enrollmentCounts={enrollmentCounts}
          familyInvitations={familyInvitations}
          siteId={schoolSelection.siteId}
          programId={schoolSelection.programId}
        /></section>}

        {!currentProgram && ["academics", "website", "families", "readiness"].includes(focus) &&
          <p role="status" className="border bg-card p-5 text-sm">Choose or save your school Program in School details before continuing this step.</p>}
  </>;
}
