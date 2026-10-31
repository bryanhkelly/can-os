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
        {currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<nav aria-label="School preparation steps" className="mt-4 flex flex-wrap gap-4 rounded-xl border bg-card p-4 text-sm font-semibold">
          <a href="#launch-services" className="underline">1. CAN services</a>
          <a href="#launch-academic-year" className="underline">2. Academic year</a>
          <a href="#launch-website" className="underline">3. School website</a>
          <a href="#invite-families" className="underline">4. Invite families</a>
        </nav>}
        {currentSchoolStatus!=="active"&&<OneHourSchoolLaunch key={`${selection.siteId ?? ""}:${selection.programId ?? ""}`} launches={launches} selectedProgramId={selection.programId} selectedSiteId={selection.siteId}/>}
        {currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<div id="launch-services" className="scroll-mt-6">
          <ProgramSiteAuthorizationPanel key={currentLaunch.id} programId={currentLaunch.id}/>
          <p className="mt-3 text-sm text-muted-foreground">You can prepare the academic year, website and family outreach while CAN reviews the requested services. Each service, admissions and school opening retain their own authorization checks.</p>
          <a href="#launch-academic-year" className="mt-2 inline-block text-sm font-semibold underline">Continue planning your academic year →</a>
        </div>}
        {currentLaunch&&!isExtendedLearningType(currentLaunch.type)&&<LaunchAcademicYearStep programId={currentLaunch.id}/>}
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
