import { Link } from "@tanstack/react-router";
import { OneHourSchoolLaunch } from "@/components/operations/OneHourSchoolLaunch";
import { LaunchAcademicYearStep } from "@/components/operations/LaunchAcademicYearStep";
import { LaunchWebsiteStep } from "@/components/operations/LaunchWebsiteStep";
import { ProgramSiteAuthorizationPanel } from "@/components/operations/ProgramSiteAuthorizationPanel";
import { LaunchFamilyProgress } from "@/components/operations/LaunchFamilyProgress";
import { isExtendedLearningType } from "@/domain/program-offerings";
import type { listLaunches } from "@/modules/programs/launch.functions";
import type { listFamilyInvitations } from "@/modules/enrollment/family-invitations.functions";
import type { getLaunchAdmissionsCounts } from "@/modules/enrollment/launch-admissions-counts.functions";
import type { getActiveEnrollmentCounts } from "@/modules/enrollment/admissions-dashboard.functions";

type Launch = Awaited<ReturnType<typeof listLaunches>>["launches"][number];

export function LaunchPreparationWorkspace({ currentLaunch, currentProgram, currentSchoolStatus, launches, selection, schoolSelection, hasSchoolPreparation, admissionsCounts, enrollmentCounts, familyInvitations }: {
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
  return <>
        {currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<section aria-label="Measured launch setup" className="mt-5 rounded-xl border bg-card p-5">
          <h2 className="font-serif text-xl">Recorded launch start</h2>
          <p className="mt-2 text-sm">Program creation: <time dateTime={currentLaunch.createdAt}>{new Date(currentLaunch.createdAt).toLocaleString()}</time>.</p>
          {currentLaunch.journey?.status==="ready"&&<p className="mt-2 text-sm">Independent review of opening is the next institutional handoff; journey readiness is not an opening timestamp.</p>}
          <p className="mt-2 text-xs text-muted-foreground">This timestamp is from the saved Program, not a browser stopwatch. No completion duration is claimed until a separately persisted completion or opening event is available. CAN review, hosting and third-party response time cannot be counted as school-controlled setup time without independently timestamped events.</p>
        </section>}
        {currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<section aria-label="Persisted launch journey" className="mt-5 rounded-xl border bg-card p-5">
          <h2 className="font-serif text-2xl">Your school's recorded launch path</h2>
          <p className="mt-2 text-sm text-muted-foreground">This view reads the saved Program, launch requirements and invitation records. Pending review is never treated as approval. Academic year, Section, website publication and safeguarding status must be verified in their authoritative workspaces.</p>
          <ol className="mt-4 grid gap-3 md:grid-cols-2">
            <li className="rounded-lg border p-3 text-sm"><strong className="block">1. School Program · Recorded</strong>{currentLaunch.name} · {currentLaunch.status}<p className="mt-1 text-xs">Owner: host registrar · Program and Site are saved; this does not authorize opening.</p></li>
            <li className="rounded-lg border p-3 text-sm"><strong className="block">2. CAN independent review · {currentLaunch.journey?.status==="ready"?"Journey ready for opening review":currentLaunch.journey?.status==="in_progress"?"In progress":"Review launch record"}</strong><p className="mt-1 text-xs">Owner: CAN for institutional requirements; host for school-owned evidence. The server alone decides activation.</p><a href="#launch-services" className="mt-2 inline-block underline">Review services and blockers</a></li>
            <li className="rounded-lg border p-3 text-sm"><strong className="block">3. Academic year and first class · Verify saved records</strong><p className="mt-1 text-xs">Owner: authorized registrar and CAN academic staff. Curriculum licensing and qualified teacher are separate prerequisites.</p><a href="#launch-academic-year" className="mt-2 inline-block underline">Review the year</a> · <a href="#launch-first-class" className="underline">Review first class</a></li>
            <li className="rounded-lg border p-3 text-sm"><strong className="block">4. Website · Verify publication record</strong><p className="mt-1 text-xs">Owner: church editor and independent publisher. Publication does not establish a reachable public site.</p><a href="#launch-website" className="mt-2 inline-block underline">Review publication</a></li>
            <li className="rounded-lg border p-3 text-sm"><strong className="block">5. Families · {familyInvitations?.batches.some(batch=>batch.programId===currentLaunch.id&&(!currentLaunch.siteId||batch.siteId===currentLaunch.siteId))?"Invitation batches recorded":"No confirmed invitation batch"}</strong><p className="mt-1 text-xs">Owner: authorized outreach operator; provider acceptance is not inbox delivery, and family interest is not enrollment.</p><a href="#invite-families" className="mt-2 inline-block underline">Resume family outreach</a></li>
            <li className="rounded-lg border p-3 text-sm"><strong className="block">6. School opening · {currentLaunch.status==="active"?"Active Program":"Not opened"}</strong><p className="mt-1 text-xs">Owner: institutional opening authority and named receiving operator. First student scheduled is not inferred from enrollment counts.</p></li>
          </ol>
        </section>}
        {currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<nav aria-label="School preparation steps" className="mt-4 flex flex-wrap gap-4 rounded-xl border bg-card p-4 text-sm font-semibold">
          <a href="#launch-services" className="underline">1. CAN services</a>
          <a href="#launch-academic-year" className="underline">2. Academic year</a>
          <a href="#launch-first-class" className="underline">3. First classroom</a>
          <a href="#launch-website" className="underline">4. School website</a>
          <a href="#invite-families" className="underline">5. Invite families</a>
        </nav>}
        {currentSchoolStatus!=="active"&&<OneHourSchoolLaunch key={`${selection.siteId ?? ""}:${selection.programId ?? ""}`} launches={launches} selectedProgramId={selection.programId} selectedSiteId={selection.siteId}/>}
        {currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<div id="launch-services" className="scroll-mt-6">
          <ProgramSiteAuthorizationPanel key={currentLaunch.id} programId={currentLaunch.id}/>
          <p className="mt-3 text-sm text-muted-foreground">You can prepare the academic year, website and family outreach while CAN reviews the requested services. Each service, admissions and school opening retain their own authorization checks.</p>
          <a href="#launch-academic-year" className="mt-2 inline-block text-sm font-semibold underline">Continue planning your academic year →</a>
        </div>}
        {currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<LaunchAcademicYearStep programId={currentLaunch.id}/>}
        {currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<section id="launch-first-class" className="mt-5 scroll-mt-6 rounded-xl border bg-card p-5" aria-label="Prepare your first classroom">
          <h2 className="font-serif text-2xl">Prepare your first classroom</h2>
          <p className="mt-2 text-sm text-muted-foreground">Use the real published curriculum, scheduled term and CAN-authorized instructor. The academic setup will suggest the first eligible course and a matching schedule, then independently verify credentials and service authorization before allowing assignment. Preparing a class never opens the school.</p>
          <Link to="/operations/launch/$programId" params={{programId:currentLaunch.id}} search={{siteId:currentLaunch.siteId??undefined,programId:undefined}} className="mt-3 inline-block text-sm font-semibold underline">Review guided academic setup →</Link>
          <p className="mt-2 text-xs text-muted-foreground">If the first classroom is still blocked, review the launch task and its named prerequisite rather than creating a placeholder course or teacher.</p>
        </section>}
        {currentProgram&&<LaunchWebsiteStep programId={currentProgram.id}/>}

        <details className="mt-4 rounded-xl border bg-card p-4">
          <summary className="cursor-pointer text-sm font-semibold">Choose who helps prepare your school</summary>
          <p className="mt-2 text-sm text-muted-foreground">An authorized administrator can invite a school registrar to complete setup, or a website editor to prepare church-owned content. Choose the exact Site in the invitation workspace. Access starts only after secure email acceptance; institutional approval remains separate.</p>
          <nav aria-label="School launch staff invitations" className="mt-3 flex flex-wrap gap-4 text-sm font-semibold">
            <Link to="/admin" search={{siteId:schoolSelection.siteId,inviteRole:"registrar"}} className="underline">Invite a school setup lead</Link>
            <Link to="/admin" search={{siteId:schoolSelection.siteId,inviteRole:"site_website_editor"}} className="underline">Invite a church website editor</Link>
          </nav>
        </details>

        {hasSchoolPreparation && <LaunchFamilyProgress
          admissionsCounts={admissionsCounts}
          enrollmentCounts={enrollmentCounts}
          familyInvitations={familyInvitations}
          siteId={schoolSelection.siteId}
          programId={schoolSelection.programId}
        />}

  </>;
}
