/**
 * V6.1 Prepare to Open is a Site-scoped orchestration surface, not an approval
 * engine. The actual Site, Blueprint, Class and admissions services own writes.
 * Do not persist user-visible checkboxes as readiness or infer regulatory fit.
 */
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, Globe2, HardHat, Info, ShieldCheck, Users, Wallet, type LucideIcon } from "lucide-react";
import { prepareStageModulesV61, type PrepareStageModuleIdV61 } from "@/domain/launch-prepare-v61";
import { SiteGuideV61 } from "./SiteGuideV61";
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
    question: "Which solutions could help bring your program ideas to life?",
    decision: "Choose a Solution, then set up its requirements.",
    canSupplies: "Available Solutions and setup guidance.",
    siteProvides: "Site details, staffing and supporting documents.",
    status: "governed",
    handoffs: [
      { title: "Manage Classes", detail: "View and set up available Classes.", href: id => "/class?view=manage&siteId=" + scoped(id) },
    ],
  },
  "facilities-resources": {
    question: "What spaces, equipment, and support will your experiences need?",
    decision: "Review rooms, capacity, internet access, devices and equipment.",
    canSupplies: "Requirements and review tools.",
    siteProvides: "Facilities and equipment information.",
    status: "governed",
    handoffs: [
      { title: "How people participate", detail: "Update where and how people take part.", href: id => "/launch/site?siteId=" + scoped(id) + "&module=site-information" },
      { title: "Site qualification", detail: "View qualification details.", href: () => "/canonical/lab/site-qualification" },
      { title: "Opening requirements", detail: "Review required documents.", href: id => "/settings/school/compliance?siteId=" + scoped(id) },
    ],
  },
  "invite-team": {
    question: "Who will help bring these experiences to life?",
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
    question: "When could people participate, and how many places will be available?",
    decision: "Plan dates, times, rooms and available places.",
    canSupplies: "Class calendars and schedules.",
    siteProvides: "Available rooms, staff and capacity.",
    status: "operational",
    handoffs: [
      { title: "Set up school years (for schools)", detail: "Manage academic terms when your program uses them.", href: () => "/operations/school-years" },
      { title: "Schedule Classes", detail: "Set up class sessions when relevant.", href: id => "/class?view=manage&siteId=" + scoped(id) },
      { title: "Review seat capacity", detail: "Review available seats.", href: id => "/admissions/capacity?siteId=" + scoped(id) },
      { title: "View calendar", detail: "View upcoming activities.", href: () => "/calendar" },
    ],
  },
  "funding-enrollment": {
    question: "How will you fund your programs and help people join?",
    decision: "Review funding, participation costs, registration and places available. Registration opens separately for approved offerings.",
    canSupplies: "Admissions and enrollment tools.",
    siteProvides: "Funding, pricing and participation policies.",
    status: "governed",
    handoffs: [
      { title: "Review school admissions", detail: "View applications when your program uses school admissions.", href: id => "/admissions?siteId=" + scoped(id) },
      { title: "Review admissions capacity", detail: "Check available places when using school admissions.", href: id => "/admissions/capacity?siteId=" + scoped(id) },
      { title: "Manage Class registration", detail: "Manage registration for eligible Classes.", href: id => "/class?view=manage&siteId=" + scoped(id) },
      { title: "Manage noncredit registration", detail: "Continue with the selected Site. Only an independently authorized provider may publish a noncredit enrollment release.", href: id => "/programs/noncredit/enrollment?publicSiteId=" + scoped(id) },
    ],
  },
  "opening-compliance": {
    question: "What needs to be ready before you can welcome participants?",
    decision: "Review applicable requirements and submit any missing documentation.",
    canSupplies: "Opening checks and reviews.",
    siteProvides: "Safety, training, insurance and facility documents.",
    status: "governed",
    handoffs: [
      { title: "Review opening requirements", detail: "See any outstanding requirements.", href: id => "/settings/school/compliance?siteId=" + scoped(id) },
      { title: "Review Site qualification", detail: "Review Site qualification.", href: () => "/canonical/lab/site-qualification" },
      { title: "Return to Solution planning", detail: "Review your selected Solution.", href: id => "/launch/site?siteId=" + scoped(id) + "&module=program-catalog" },
    ],
  },
  "publish-site": {
    question: "Is your website ready for visitors?",
    decision: "Review your site's identity, website text, photos, permissions, and hosting. Publishing your website doesn't open registration.",
    canSupplies: "Website review, publication records, and a way to check whether your site is live.",
    siteProvides: "Accurate website information, permission to use images, and a reason for your decision.",
    status: "governed",
    handoffs: [
      { title: "Edit Website & Brand", detail: "Update your website draft without publishing it.", href: id => "/launch/website?siteId=" + scoped(id) + "&returnToHub=true" },
      { title: "Review website publication", detail: "Check whether your website is published and what needs review.", href: id => "/sites/" + scoped(id) + "/publish" },
    ],
  },
};

/** Decisions to consider, not an inferred compliance or approval status. */
const prepareGuideInsights: Record<PrepareModuleIdV61, { insight: string; connection: string }> = {
  "program-catalog": {
    insight: "A Solution is the way you deliver a Program. Compare the people, space, equipment and supervision it actually requires, not just the title.",
    connection: "A selected Solution creates a plan to prepare and review. It does not yet authorize an offering.",
  },
  "facilities-resources": {
    insight: "Think through the real activities, not just the room name: accessibility, internet access, equipment, capacity and any specialized materials may matter.",
    connection: "Facilities can be checked against your selected Solution's needs before you schedule participants.",
  },
  "invite-team": {
    insight: "Separate who leads the experience, who facilitates it locally, and who handles administration. One person may hold more than one role, but each role has its own requirements.",
    connection: "Staff assignments and qualifications help determine whether a planned Solution can operate.",
  },
  "schedules-capacity": {
    insight: "Start with the actual space, staff availability and session format. A large interested audience does not automatically mean those seats exist.",
    connection: "Your dates and capacity feed operational planning; they do not publish a class or open registration.",
  },
  "funding-enrollment": {
    insight: "Consider what participants can afford, who may pay on their behalf, and whether a funding source has actually been confirmed.",
    connection: "Fees, funding and registration configuration are separate from the approval to accept participants.",
  },
  "opening-compliance": {
    insight: "Start with the needs of each selected Solution. General Site setup is not enough to verify safety, staffing or an offering's specific requirements.",
    connection: "The readiness workspaces show the records and decisions that actually govern launch.",
  },
  "publish-site": {
    insight: "Read the website as a first-time visitor. Could someone mistake a planned experience or unverified affiliation for an approved service?",
    connection: "A private preview can be shared before publication. Publishing the website does not open registration.",
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

function displaySelectedProgram(code:string, available?:readonly BlueprintReferenceCatalogItem[]):string {
  const published=available?.find(item=>item.code===code)?.title;
  if(published)return published;
  const name=code.split(".").at(-1)?.replaceAll("_"," ").trim();
  if(!name)return "Selected program";
  return name.replace(/\b[a-z]/g,letter=>letter.toUpperCase()).replace(/\bAi\b/g,"AI");
}

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
    rail={<SiteGuideV61 guide={{
      summary: plan.question,
      highlights: module === "program-catalog"
        ? (intent?.interestIds ?? []).slice(0, 3).map(id => intentTitles[id])
        : [],
      insight: prepareGuideInsights[module].insight,
      connection: prepareGuideInsights[module].connection,
    }} />}>
    <div className="mt-6 space-y-5">
      {module === "program-catalog" && <>
        <WorkspacePanel title="Your interests"
          description="Your saved program ideas and areas of interest from Shape.">
          {intentUnavailable && <WorkspaceNotice tone="attention">
            We couldn't load your saved program ideas. You can still explore solutions, but return to Shape to check your selections before making a plan.
          </WorkspaceNotice>}
          {intent && (intent.interestIds.length > 0 || (intent.programCodes?.length??0)>0) ? <>
            {(intent.programCodes?.length??0)>0&&<>
              <p className="text-xs font-medium text-muted-foreground">Programs you want to explore</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {intent.programCodes?.map(code => <span key={code} className="border bg-muted px-3 py-2 text-xs font-medium">
                  {displaySelectedProgram(code,schoolYearAcademyPrograms)}
                </span>)}
              </div>
            </>}
            {intent.interestIds.length>0&&<>
            <p className="text-xs font-medium text-muted-foreground">Other areas of interest</p>
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
            </>}
          </> : !intentUnavailable && <p className="text-sm text-muted-foreground">You haven't chosen any program ideas yet. Explore the catalog or return to Shape to add them.</p>}
          <Link to="/launch/site" search={{siteId, module:"programs-audiences"}}
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline">
            Review Programs &amp; Audiences <ArrowRight aria-hidden="true" className="size-4" />
          </Link>
        </WorkspacePanel>
        <WorkspacePanel title="How offerings work">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Program", "Your broad idea of what you want to offer."],
              ["Solution", "A specific way to deliver it, including people, space, equipment and safety needs."],
              ["Offering", "What participants can join when the necessary approvals and registration are in place."],
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
          Choosing a solution is a planning step, not permission to offer it yet. You'll see its specific requirements as you prepare.
        </WorkspaceNotice>
      </>}
      {module === "publish-site" && <LaunchSitePublicationPanel key={siteId} siteId={siteId} />}
      {module === "facilities-resources" && <PrepareFacilitiesV61 key={siteId} siteId={siteId} />}
      {module === "invite-team" && <PrepareTeamV61 key={siteId} siteId={siteId} />}
      {module === "schedules-capacity" && <PrepareSchedulesV61 key={siteId} siteId={siteId} />}
      {(module === "funding-enrollment" || module === "opening-compliance") && <WorkspacePanel
        title={module === "funding-enrollment" ? "Before people register" : "Opening decisions and requirements"}
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
          description="Check what you've completed and what still needs attention."
          href={"/launch/site?siteId="+scoped(siteId)+"&module=opening-compliance"}
          actionLabel="Review readiness"/>}
      <PrepareModuleHandoffs siteId={siteId} handoffs={plan.handoffs}
        secondary={module === "facilities-resources" || module === "invite-team" ||
          module === "schedules-capacity"} />
      {module==="publish-site"&&<WorkspaceNotice tone="info">
        Sharing a private preview is different from publishing your website. Publishing does not open registration.
      </WorkspaceNotice>}
      {module==="funding-enrollment"&&<WorkspaceNotice tone="info">
        Saving registration settings does not open enrollment. Each offering needs its own approval and publication steps.
      </WorkspaceNotice>}
    </div>
  </WorkspaceShell>;
}
