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
    decision: "Select a CAN-published Solution aligned with your Site vision and configure its operating requirements here in Prepare. Enrollable Classes remain independently authorized.",
    canSupplies: "CAN-administered, versioned Solution definitions, published learning products, eligibility guidance and authorized configuration workflows.",
    siteProvides: "A selected operating model, physical capabilities, staff coverage, local constraints and evidence.",
    status: "governed",
    handoffs: [
      { title: "Manage authorized Classes", detail: "Configure actual Classes only where the existing Course and Site gates allow it.", href: id => "/class?view=manage&siteId=" + scoped(id) },
    ],
  },
  "facilities-resources": {
    question: "Can your Site safely and reliably support each proposed learning experience?",
    decision: "Review room use, accessible capacity, connectivity, learner devices, specialized equipment and any unmet needs against the selected operating model.",
    canSupplies: "Site qualification observations, requirement evidence and independently reviewed program-fit records.",
    siteProvides: "Accurate facility information, equipment inventory, accessibility details, and requested proof.",
    status: "governed",
    handoffs: [
      { title: "Review Learning Environment", detail: "Update the existing Site-owned learning environment and delivery information.", href: id => "/launch/site?siteId=" + scoped(id) + "&module=site-information" },
      { title: "Inspect qualification evidence", detail: "Open the authorized canonical qualification inspection, where available.", href: () => "/canonical/lab/site-qualification" },
      { title: "Review opening requirements", detail: "Required safeguards and evidence remain governed by the actual opening process.", href: id => "/settings/school/compliance?siteId=" + scoped(id) },
    ],
  },
  "invite-team": {
    question: "Who will supervise, support and operate the experiences at this Site?",
    decision: "Identify required positions per Solution, invite people to the exact Site, and resolve appointments, training and safeguarding separately.",
    canSupplies: "Scoped staff invitations, access control and the appropriate academic or operational role workflows.",
    siteProvides: "Named people, assignment coverage, local supervision, and evidence of qualifications where required.",
    status: "operational",
    handoffs: [
      { title: "Invite a team member", detail: "Send an authorized invitation without creating an unverified role grant.", href: id => "/admin/invite?siteId=" + scoped(id) },
      { title: "Review Site access", detail: "Inspect current members and active permissions for your Site.", href: id => "/admin?siteId=" + scoped(id) },
    ],
  },
  "schedules-capacity": {
    question: "When will each experience run, and how many learners can it support?",
    decision: "Use the actual academic calendar and Class configuration for dates, operating days, time of day, frequency, holidays, session pattern and attendance capacity.",
    canSupplies: "School-year planning, Class scheduling, calendars and admission seat pools under their existing authority.",
    siteProvides: "Operating availability, usable rooms, staffing coverage and reliable capacity commitments.",
    status: "operational",
    handoffs: [
      { title: "Configure school years", detail: "Use the authorized academic term and school-year workspace.", href: () => "/operations/school-years" },
      { title: "Configure Class sessions", detail: "Schedule actual Classes in the native Class workspace.", href: id => "/class?view=manage&siteId=" + scoped(id) },
      { title: "Review seat capacity", detail: "Program and school-year capacities are independently recorded.", href: id => "/admissions/capacity?siteId=" + scoped(id) },
      { title: "View calendar", detail: "See scheduled activities in the shared calendar.", href: () => "/calendar" },
    ],
  },
  "funding-enrollment": {
    question: "How will your Site fund its learning experiences and prepare admissions?",
    decision: "Document funding sources, tuition and pricing, admissions policies and seat capacity. Prepare the receiving Program and application process here. Actual registration is enabled independently in Open, only for authorized Offerings.",
    canSupplies: "Authorized admissions setup, application invitations, eligibility records and capacity management where supported.",
    siteProvides: "An approved budget, documented funding, pricing and admissions decisions, and responsible staff.",
    status: "governed",
    handoffs: [
      { title: "Review admissions", detail: "View authorized applications and the Program-specific admissions pipeline.", href: id => "/admissions?siteId=" + scoped(id) },
      { title: "Prepare admissions capacity", detail: "Configure and verify seat pools without activating registration.", href: id => "/admissions/capacity?siteId=" + scoped(id) },
      { title: "Manage Class Offerings and enrollment", detail: "Publish authorized Class registration terms and inspect enrollment communication status in the Class workspace.", href: id => "/class?view=manage&siteId=" + scoped(id) },
      { title: "Publish approved noncredit Course registration", detail: "Use the existing noncredit release publisher. Course registration does not automatically create a Class enrollment.", href: () => "/programs/noncredit/enrollment" },
    ],
  },
  "opening-compliance": {
    question: "What must be independently verified before you can operate or enroll learners?",
    decision: "Review requirements for the specific Site, jurisdiction and selected Offerings. Submit evidence through the responsible workflows; never mark a step completed merely by visiting it.",
    canSupplies: "Institutional opening checks, governed evidence review and separate authorization decisions.",
    siteProvides: "Accurate safeguarding information, training, insurance, facilities and required documentation.",
    status: "governed",
    handoffs: [
      { title: "Review opening and compliance", detail: "Resolve real opening blockers in the institutional preparation workflow.", href: id => "/settings/school/compliance?siteId=" + scoped(id) },
      { title: "Review Site qualification", detail: "Inspect recorded facility and program-fit evidence, where authorized.", href: () => "/canonical/lab/site-qualification" },
      { title: "Return to Solution planning", detail: "Verify the selected operating model, not just the intended Program.", href: id => "/launch/site?siteId=" + scoped(id) + "&module=program-catalog" },
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
      These actions open the existing authorized workspaces for advanced work.
    </p>
    {links}
  </details>;
  return <WorkspacePanel title="Continue in the authorized workspace"
    description="These actions use the existing business records, permissions and verification gates.">
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
  const Icon = definition.icon;
  return <WorkspaceShell width="wide" title={definition.title}
    eyebrow="Launch Studio / Prepare"
    subtitle={definition.subtitle}
    rail={<div className="space-y-4">
      <WorkspacePanel title="The decision to make">
        <p className="text-sm font-semibold leading-6">{plan.question}</p>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{plan.decision}</p>
      </WorkspacePanel>
      <WorkspacePanel title="Shared responsibilities">
        <h3 className="text-sm font-semibold">What CAN provides</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{plan.canSupplies}</p>
        <h3 className="mt-4 border-t pt-4 text-sm font-semibold">What the local Site provides</h3>
        <p className="mt-1 text-sm leading-6 text-muted-foreground">{plan.siteProvides}</p>
      </WorkspacePanel>
      <p className="text-xs leading-5 text-muted-foreground">Planning progress, operational readiness and legal authorization are separate. No status on this page grants approval.</p>
    </div>}>
    <div className="mt-6 space-y-5">
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon aria-hidden="true" className="size-4" />
        {plan.status === "governed"
          ? "Independent review is required for the applicable decisions"
          : "Complete the required actions in the existing authorized workspaces"}
      </p>
      {module === "program-catalog" && <>
        <WorkspacePanel title="Begin with your vision"
          description="Your interests from Establish guide discovery, not automatic qualification.">
          {intentUnavailable && <WorkspaceNotice tone="attention">
            Saved Programs & Audiences could not be loaded. You can still browse the published catalog,
            but return to Establish to review your preferences before planning a Solution.
          </WorkspaceNotice>}
          {intent && intent.interestIds.length > 0 ? <>
            <p className="text-xs font-medium text-muted-foreground">What you said you want to offer</p>
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
          </> : !intentUnavailable && <p className="text-sm text-muted-foreground">You have not saved any learning interests. You can explore the catalog now and add your vision later.</p>
          <Link to="/launch/site" search={{siteId, module:"programs-audiences"}}
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline">
            Review Programs &amp; Audiences <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </WorkspacePanel>
        <WorkspacePanel title="From Program to Solution to Offering"
          description="These are different decisions, with different verification responsibilities.">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Program", "Your high-level intention, captured in Establish."],
              ["Solution", "The packaged operating configuration: roles, rooms, activities, equipment, schedules, safety and evidence."],
              ["Offering", "The approved, configured experience learners may enroll in, when separately authorized."],
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
        description="Use requirements from the chosen Solution and applicable jurisdiction, rather than a generic checklist.">
        <div className="flex gap-3">
          <ClipboardCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
          <div className="text-sm leading-6">
            <p>{plan.decision}</p>
            <p className="mt-2 text-muted-foreground">Current readiness results must be read from the linked authorized operational records. This page does not claim that any requirement has passed.</p>
          </div>
        </div>
      </WorkspacePanel>}
      <LaunchReadinessPanelV61 key={siteId + ":" + module} siteId={siteId} context="prepare" />
      <PrepareModuleHandoffs siteId={siteId} handoffs={plan.handoffs}
        secondary={module === "facilities-resources" || module === "invite-team" ||
          module === "schedules-capacity"} />
      <WorkspaceNotice tone="info"><Info aria-hidden="true" className="mr-2 inline size-4" />
        A shared preview is not Site publication. Publishing the Site is not approval to operate, publish an Offering, or enroll learners.
      </WorkspaceNotice>
    </div>
  </WorkspaceShell>;
}
