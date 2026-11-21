/**
 * V6.1 Prepare to Open is a Site-scoped orchestration surface, not an approval
 * engine. The actual Site, Blueprint, Class and admissions services own writes.
 * Do not persist user-visible checkboxes as readiness or infer regulatory fit.
 */
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, Globe2, HardHat, Info, ShieldCheck, Users, Wallet, type LucideIcon } from "lucide-react";
import { prepareStageModulesV61, type PrepareStageModuleIdV61 } from "@/domain/launch-prepare-v61";
import { Link } from "@tanstack/react-router";
import { WorkspaceActionLink, WorkspaceNotice, WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import { SolutionCatalogV61 } from "./SolutionCatalogV61";
import { LaunchSitePublicationPanel } from "./LaunchSitePublicationPanel";
import { LaunchReadinessPanelV61 } from "./LaunchReadinessPanelV61";
import { PrepareFacilitiesV61, PrepareSchedulesV61, PrepareTeamV61 } from "./PrepareOperationsV61";
import type { SiteProgramsAudiencesV61 } from "@/domain/site-launch-preferences";
import type { BlueprintReferenceCatalogItem } from "@/domain/blueprint-reference-catalog";
import type { SchoolYearAvailability } from "@/domain/site-program-access-v61";
import { schoolYearInterestMayBeSelected } from "@/domain/site-program-access-v61";

const prepareModuleIcons: Record<PrepareStageModuleIdV61, LucideIcon> = {
  "program-catalog": BookOpen,
  "facilities-resources": HardHat,
  "invite-team": Users,
  "schedules-capacity": CalendarDays,
  "funding-enrollment": Wallet,
  "opening-compliance": ShieldCheck,
  "publish-site": Globe2,
};

export const prepareModulesV61 = prepareStageModulesV61.map(module => ({
  ...module, icon: prepareModuleIcons[module.id],
}));

export type PrepareModuleIdV61 = PrepareStageModuleIdV61;
export function isPrepareModuleV61(id: string): id is PrepareModuleIdV61 {
  return prepareModulesV61.some(module => module.id === id);
}

type Handoff = { title: string; detail: string; href: (siteId: string) => string };
type ModulePlan = {
  question: string;
  decision: string;
  canSupplies: string;
  siteProvides: string;
  status: "operational" | "governed";
  handoffs: readonly Handoff[];
};

const scoped = (siteId: string) => encodeURIComponent(siteId);
/** These destinations are existing authorized operations, not new task stores. */
const modulePlans: Record<PrepareModuleIdV61, ModulePlan> = {
  "program-catalog": {
    question: "Which published Solutions support the programs your community wants to offer?",
    decision: "Choose a Solution, then set up its requirements.",
    canSupplies: "Available Solutions and setup guidance.",
    siteProvides: "Site details, staffing and supporting documents.",
    status: "governed",
    handoffs: [
      { title: "Manage Classes", detail: "View and set up available Classes.", href: id => "/class?view=manage&siteId=" + scoped(id) },
    ],
  },
  "facilities-resources": {
    question: "Can your Site safely and reliably support each proposed learning experience?",
    decision: "Review rooms, capacity, internet access, devices and equipment.",
    canSupplies: "Requirements and review tools.",
    siteProvides: "Facilities and equipment information.",
    status: "governed",
    handoffs: [
      { title: "Learning Environment", detail: "Update learning environment details.", href: id => "/launch/site?siteId=" + scoped(id) + "&module=site-information" },
      { title: "Site qualification", detail: "View qualification details.", href: () => "/canonical/lab/site-qualification" },
      { title: "Opening requirements", detail: "Review required documents.", href: id => "/settings/school/compliance?siteId=" + scoped(id) },
    ],
  },
  "invite-team": {
    question: "Who will supervise, support and operate the experiences at this Site?",
    decision: "Invite your team and assign the roles needed for each Solution.",
    canSupplies: "Invitations, roles and permissions.",
    siteProvides: "Team members and qualifications.",
    status: "operational",
    handoffs: [
      { title: "Invite a team member", detail: "Invite someone to your Site.", href: id => "/admin/invite?siteId=" + scoped(id) },
      { title: "Review Site access", detail: "View team members and permissions.", href: id => "/admin?siteId=" + scoped(id) },
    ],
  },
  "schedules-capacity": {
    question: "When will each experience run, and how many learners can it support?",
    decision: "Set dates, times, rooms and learner capacity.",
    canSupplies: "Class calendars and schedules.",
    siteProvides: "Available rooms, staff and capacity.",
    status: "operational",
    handoffs: [
      { title: "Configure school years", detail: "Set up academic terms.", href: () => "/operations/school-years" },
      { title: "Configure Class sessions", detail: "Schedule Classes.", href: id => "/class?view=manage&siteId=" + scoped(id) },
      { title: "Review seat capacity", detail: "Review available seats.", href: id => "/admissions/capacity?siteId=" + scoped(id) },
      { title: "View calendar", detail: "View upcoming activities.", href: () => "/calendar" },
    ],
  },
  "funding-enrollment": {
    question: "How will your Site fund its learning experiences and prepare admissions?",
    decision: "Set funding, pricing, admissions and capacity. Enrollment opens later for approved offerings.",
    canSupplies: "Admissions and enrollment tools.",
    siteProvides: "Funding, pricing and admissions policies.",
    status: "governed",
    handoffs: [
      { title: "Review admissions", detail: "View applications.", href: id => "/admissions?siteId=" + scoped(id) },
      { title: "Prepare admissions capacity", detail: "Set available seats.", href: id => "/admissions/capacity?siteId=" + scoped(id) },
      { title: "Manage Class Offerings and enrollment", detail: "Manage Class registration.", href: id => "/class?view=manage&siteId=" + scoped(id) },
      { title: "Publish approved noncredit Course registration", detail: "Manage noncredit Course registration.", href: () => "/programs/noncredit/enrollment" },
    ],
  },
  "opening-compliance": {
    question: "What must be independently verified before you can operate or enroll learners?",
    decision: "Review applicable requirements and submit any missing documentation.",
    canSupplies: "Opening checks and reviews.",
    siteProvides: "Safety, training, insurance and facility documents.",
    status: "governed",
    handoffs: [
      { title: "Review opening and compliance", detail: "Review outstanding requirements.", href: id => "/settings/school/compliance?siteId=" + scoped(id) },
      { title: "Review Site qualification", detail: "Review Site qualification.", href: () => "/canonical/lab/site-qualification" },
      { title: "Return to Solution planning", detail: "Review your selected Solution.", href: id => "/launch/site?siteId=" + scoped(id) + "&module=program-catalog" },
    ],
  },
  "publish-site": {
    question: "Is the public-facing Site website reviewed and ready to go live?",
    decision: "Review the Site identity, published local copy, licensed imagery, approved claims and live hosting. Record explicit Site publication separately from Offering releases and enrollment.",
    canSupplies: "The canonical Site publisher, review checks, audit history, and public-host reachability verification.",
    siteProvides: "Accurate public information, photo rights and consent, responsible publication authority, and an explicit decision reason.",
    status: "governed",
    handoffs: [
      { title: "Edit Website & Brand", detail: "Return to Establish to revise and save the Site website without automatically publishing it.", href: id => "/launch/website?siteId=" + scoped(id) + "&returnToHub=true" },
      { title: "Review full publishing details", detail: "See the existing institutional publication and approved content workflows.", href: id => "/sites/" + scoped(id) + "/publish" },
    ],
  },
};

const intentTitles: Record<SiteProgramsAudiencesV61["interestIds"][number], string> = {
  "grades-6-8": "Grades 6–8",
  "grades-9-12": "Grades 9–12",
  afterschool: "After-School",
  summer: "Summer",
  adult: "Adult Learning",
  senior: "Older Adults",
};

function PrepareModuleHandoffs({ siteId, handoffs, secondary = false }: {
  siteId: string; handoffs: readonly Handoff[]; secondary?: boolean;
}) {
  if (!handoffs.length) return null;
  const links = <div className="grid gap-3">
    {handoffs.map(item => <WorkspaceActionLink key={item.title}
      title={item.title} description={item.detail}
      href={item.href(siteId)} actionLabel={item.title} />)}
  </div>;
  // Once an operation is embedded, its external route becomes an optional
  // advanced handoff rather than a competing primary action.
  if (secondary) return <details className="border bg-card p-4">
    <summary className="min-h-11 cursor-pointer text-sm font-semibold text-primary">
      Advanced operations and complete records
    </summary>
    <p className="my-3 text-xs text-muted-foreground">
      Open additional tools.
    </p>
    {links}
  </details>;
  return <WorkspacePanel title="Additional tools">
    {links}
  </WorkspacePanel>;
}

export function LaunchPrepareV61({ module, siteId, intent, delivery, solutionPlanId, schoolYearAvailability, schoolYearAcademyPrograms, intentUnavailable = false }: {
  module: PrepareModuleIdV61;
  siteId: string;
  solutionPlanId?: string;
  intent?: SiteProgramsAudiencesV61 | null;
  delivery?: "physical" | "digital" | "both" | null;
  schoolYearAvailability?: SchoolYearAvailability;
  schoolYearAcademyPrograms?: readonly BlueprintReferenceCatalogItem[];
  intentUnavailable?: boolean;
}) {
  const definition = prepareModulesV61.find(item => item.id === module)!; // Module navigation is owned by LaunchSiteFrame.
  const plan = modulePlans[module];
  return <WorkspaceShell width="wide" title={definition.title}
    eyebrow="Launch Studio / Prepare"
    subtitle={definition.subtitle}
    rail={<WorkspacePanel title="Next">
      <p className="text-sm leading-6 text-muted-foreground">{plan.question}</p>
    </WorkspacePanel>}>
    <div className="mt-6 space-y-5">
      {module === "program-catalog" && <>
        <WorkspacePanel title="Your interests"
          description="These are the interests you selected during setup.">
          {intentUnavailable && <WorkspaceNotice tone="attention">
            Saved Programs & Audiences could not be loaded. You can still browse the published catalog,
            but return to Establish to review your preferences before planning a Solution.
          </WorkspaceNotice>}
          {intent && intent.interestIds.length > 0 ? <>
            <p className="text-xs font-medium text-muted-foreground">Selected interests</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {intent.interestIds.map(id => {
                const blocked = !schoolYearAvailability ||
                  !schoolYearInterestMayBeSelected(id,schoolYearAvailability);
                return <span key={id} className={"border bg-muted px-3 py-2 text-xs font-medium " +
                    (blocked && (id === "grades-6-8" || id === "grades-9-12")
                      ? "opacity-50" : "")}
                    title={blocked && (id === "grades-6-8" || id === "grades-9-12")
                      ? "Previously selected; school-year authorization required" : undefined}>
                    {intentTitles[id]}
                  </span>;
              })}
            </div>
            {intent.startingFocus && <p className="mt-3 text-sm">Starting focus: <strong>{intentTitles[intent.startingFocus]}</strong></p>}
          </> : !intentUnavailable && <p className="text-sm text-muted-foreground">No interests selected. Browse the catalog or add interests.</p>}
          <Link to="/launch/site" search={{siteId, module:"programs-audiences"}}
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline">
            Review Programs &amp; Audiences <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </WorkspacePanel>
        <WorkspacePanel title="How offerings work">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Program", "What you want to offer."],
              ["Solution", "The staffing, space, equipment and schedule needed."],
              ["Offering", "The experience learners can register for after approval."],
            ].map(([name, detail], i) => <div key={name} className="border bg-background p-4">
              <p className="text-xs font-semibold text-muted-foreground">0{i + 1}</p>
              <h3 className="mt-2 font-semibold">{name}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
            </div>)}
          </div>
        </WorkspacePanel>
        <SolutionCatalogV61 key={siteId} siteId={siteId} intent={intent} delivery={delivery}
          schoolYearAvailability={schoolYearAvailability}
          schoolYearAcademyPrograms={schoolYearAcademyPrograms}
          initialPlanId={solutionPlanId} />
        <WorkspaceNotice tone="info"><Info aria-hidden="true" className="mr-2 inline size-4" />
          CAN administers the published Solution definition. Site operators configure their own plan with the existing governed commands.
          Discovery and planning never grant Site qualification, publication or enrollment authority.
        </WorkspaceNotice>
      </>}
      {module === "publish-site" && <LaunchSitePublicationPanel key={siteId} siteId={siteId} />}
      {module === "facilities-resources" && <PrepareFacilitiesV61 key={siteId} siteId={siteId} />}
      {module === "invite-team" && <PrepareTeamV61 key={siteId} siteId={siteId} />}
      {module === "schedules-capacity" && <PrepareSchedulesV61 key={siteId} siteId={siteId} />}
      {(module === "funding-enrollment" || module === "opening-compliance") && <WorkspacePanel title="What to prepare"
        description="Requirements depend on the Solution and location.">
        <div className="flex gap-3">
          <ClipboardCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
          <div className="text-sm leading-6">
            <p>{plan.decision}</p>
          </div>
        </div>
      </WorkspacePanel>}
      {(module==="opening-compliance"||module==="funding-enrollment") &&
        <LaunchReadinessPanelV61 key={siteId + ":" + module} siteId={siteId} context="prepare" />}
      {module!=="opening-compliance"&&module!=="funding-enrollment"&&
        <WorkspaceActionLink title="Review full readiness"
          description="Inspect Site-scoped evidence, required approvals and remaining preparation."
          href={"/launch/site?siteId="+scoped(siteId)+"&module=opening-compliance"}
          actionLabel="Review readiness"/>}
      <PrepareModuleHandoffs siteId={siteId} handoffs={plan.handoffs}
        secondary={module === "facilities-resources" || module === "invite-team" ||
          module === "schedules-capacity"} />
      <WorkspaceNotice tone="info"><Info aria-hidden="true" className="mr-2 inline size-4" />
        A shared preview is not Site publication. Publishing the Site is not approval to operate, publish an Offering, or enroll learners.
      </WorkspaceNotice>
    </div>
  </WorkspaceShell>;
}
