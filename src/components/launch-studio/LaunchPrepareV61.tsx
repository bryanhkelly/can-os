/**
 * V6.1 Prepare to Open is a Site-scoped orchestration surface, not an approval
 * engine. The actual Site, Blueprint, Class and admissions services own writes.
 * Do not persist user-visible checkboxes as readiness or infer regulatory fit.
 */
import { ArrowRight, BookOpen, CalendarDays, ClipboardCheck, HardHat, Info, ShieldCheck, Users, Wallet, type LucideIcon } from "lucide-react";
import { prepareStageModulesV61, type PrepareStageModuleIdV61 } from "@/domain/launch-prepare-v61";
import { Button } from "@/components/ui/button";
import { StatusBadge, WorkspaceNotice, WorkspacePanel, WorkspaceShell } from "@/components/workspace";
import { ProgramDiscoveryPanel } from "./ProgramDiscoveryPanel";
import { SolutionCatalogV61 } from "./SolutionCatalogV61";
import type { SiteProgramsAudiencesV61 } from "@/domain/site-launch-preferences";

const prepareModuleIcons: Record<PrepareStageModuleIdV61, LucideIcon> = {
  "program-catalog": BookOpen,
  "facilities-resources": HardHat,
  "invite-team": Users,
  "schedules-capacity": CalendarDays,
  "funding-enrollment": Wallet,
  "opening-compliance": ShieldCheck,
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
const prepareHref = (siteId: string, module: PrepareModuleIdV61) =>
  "/launch/site?siteId=" + scoped(siteId) + "&module=" + module;

/** These destinations are existing authorized operations, not new task stores. */
const modulePlans: Record<PrepareModuleIdV61, ModulePlan> = {
  "program-catalog": {
    question: "Which packaged learning experiences fit the community you want to serve?",
    decision: "Explore published Offerings and reference models. Record an adoption intent only inside the authorized Blueprint planning workflow.",
    canSupplies: "Published Offering versions, delivery eligibility guidance, and governed Blueprint planning.",
    siteProvides: "A selected operating model, physical capabilities, staff coverage, local constraints and evidence.",
    status: "governed",
    handoffs: [
      { title: "Plan in the canonical Blueprint workspace", detail: "Select published Offerings in a private Blueprint draft; approval and adoption remain separate.", href: id => "/canonical/blueprints?siteId=" + scoped(id) },
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
    question: "What will families pay, what funding is allowed, and who may enroll?",
    decision: "Evaluate applicable funding programs and tuition outside the admissions decision. Configure actual seat pools, receiving Program and enrollment workflow only when authorized.",
    canSupplies: "Governed admissions, application invitations, eligibility and capacity records where supported.",
    siteProvides: "An approved budget, funding documentation, pricing decisions and accountable enrollment staff.",
    status: "governed",
    handoffs: [
      { title: "Review admissions", detail: "View authorized applications and the Program-specific admissions pipeline.", href: id => "/admissions?siteId=" + scoped(id) },
      { title: "Configure enrollment capacity", detail: "Review seat pools rather than assuming intended capacity is enrollable.", href: id => "/admissions/capacity?siteId=" + scoped(id) },
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
      { title: "Return to Blueprint planning", detail: "Verify the selected operating model, not just the intended Program.", href: id => "/canonical/blueprints?siteId=" + scoped(id) },
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

function PrepareModuleHandoffs({ siteId, handoffs }: { siteId: string; handoffs: readonly Handoff[] }) {
  return <WorkspacePanel title="Continue in the authorized workspace"
    description="These actions use the existing business records, permissions and verification gates.">
    <div className="grid gap-3">
      {handoffs.map(item => <div key={item.title} className="flex flex-wrap items-center justify-between gap-3 border bg-background p-4">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{item.title}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{item.detail}</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <a href={item.href(siteId)}>{item.title}<ArrowRight aria-hidden="true" className="size-4" /></a>
        </Button>
      </div>)}
    </div>
  </WorkspacePanel>;
}

export function LaunchPrepareV61({ module, siteId, intent }: {
  module: PrepareModuleIdV61;
  siteId: string;
  intent?: SiteProgramsAudiencesV61 | null;
}) {
  const index = prepareModulesV61.findIndex(item => item.id === module);
  const definition = prepareModulesV61[index]!; // The public module union is derived from this registry.
  const plan = modulePlans[module];
  const next = prepareModulesV61[index + 1];
  const previous = prepareModulesV61[index - 1];
  const Icon = definition.icon;
  return <WorkspaceShell width="wide" title={definition.title}
    eyebrow={"Prepare to Open / " + (index + 1) + " of " + prepareModulesV61.length}
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
      <div className="flex flex-wrap items-center justify-between gap-3 border bg-card p-5">
        <div className="flex items-center gap-3">
          <span className="flex size-11 items-center justify-center bg-muted"><Icon aria-hidden="true" className="size-5" /></span>
          <div><p className="text-sm font-semibold">Prepare your Site</p>
            <p className="text-xs text-muted-foreground">Step {index + 1} of {prepareModulesV61.length} · Work at your own pace</p></div>
        </div>
        <StatusBadge tone="info">{plan.status === "governed" ? "Independent review applies" : "Existing operational workflow"}</StatusBadge>
      </div>
      <nav aria-label="Prepare modules" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {prepareModulesV61.map((item, position) => {
          const StepIcon = item.icon;
          return <a key={item.id} href={prepareHref(siteId, item.id)}
            aria-current={module === item.id ? "page" : undefined}
            className={"flex min-h-14 items-start gap-3 border p-3 text-left text-sm hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring " +
              (module === item.id ? "border-primary bg-accent font-semibold" : "border-border bg-card")}>
            <StepIcon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            <span><span className="block text-xs text-muted-foreground">{String(position + 1).padStart(2, "0")}</span>{item.title}</span>
          </a>;
        })}
      </nav>
      {module === "program-catalog" && <>
        <WorkspacePanel title="Begin with your vision"
          description="Your interests from Establish guide discovery, not automatic qualification.">
          {intent && intent.interestIds.length > 0 ? <>
            <p className="text-xs font-medium text-muted-foreground">What you said you want to offer</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {intent.interestIds.map(id => <span key={id} className="border bg-muted px-3 py-2 text-xs font-medium">{intentTitles[id]}</span>)}
            </div>
            {intent.startingFocus && <p className="mt-3 text-sm">Starting focus: <strong>{intentTitles[intent.startingFocus]}</strong></p>}
          </> : <p className="text-sm text-muted-foreground">You have not saved any learning interests. You can explore the catalog now and add your vision later.</p>}
          <a href={"/launch/site?siteId=" + scoped(siteId) + "&module=programs-audiences"}
            className="mt-4 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary underline">
            Review Programs &amp; Audiences <ArrowRight aria-hidden="true" className="size-4" />
          </a>
        </WorkspacePanel>
        <WorkspacePanel title="From Program to Solution to Offering"
          description="These are different decisions, with different verification responsibilities.">
          <div className="grid gap-3 md:grid-cols-3">
            {[
              ["Program", "Your high-level intention, captured in Establish."],
              ["Solution / Blueprint", "The packaged operating configuration: roles, rooms, activities, equipment, schedules, safety and evidence."],
              ["Offering", "The approved, configured experience learners may enroll in, when separately authorized."],
            ].map(([name, detail], i) => <div key={name} className="border bg-background p-4">
              <p className="text-xs font-semibold text-muted-foreground">0{i + 1}</p>
              <h3 className="mt-2 font-semibold">{name}</h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{detail}</p>
            </div>)}
          </div>
        </WorkspacePanel>
        <SolutionCatalogV61 key={siteId} siteId={siteId} />
        <ProgramDiscoveryPanel key={siteId} siteId={siteId} />
        <WorkspaceNotice tone="info"><Info aria-hidden="true" className="mr-2 inline size-4" />
          Discovery returns published Offerings and their availability policies, not a complete verified Solution fit.
          Adoption intent is recorded in the existing Blueprint workspace; no duplicate selection record is created here.
        </WorkspaceNotice>
      </>}
      {module !== "program-catalog" && <WorkspacePanel title="What to prepare"
        description="Use requirements from the chosen Solution and applicable jurisdiction, rather than a generic checklist.">
        <div className="flex gap-3">
          <ClipboardCheck aria-hidden="true" className="mt-1 size-5 shrink-0 text-primary" />
          <div className="text-sm leading-6">
            <p>{plan.decision}</p>
            <p className="mt-2 text-muted-foreground">Current readiness results must be read from the linked authorized operational records. This page does not claim that any requirement has passed.</p>
          </div>
        </div>
      </WorkspacePanel>}
      <PrepareModuleHandoffs siteId={siteId} handoffs={plan.handoffs}/>
      <WorkspaceNotice tone="info"><Info aria-hidden="true" className="mr-2 inline size-4" />
        Site planning is not approval to operate, publish an Offering, or enroll learners.
      </WorkspaceNotice>
      <nav aria-label="Prepare module navigation" className="flex flex-wrap justify-between gap-3 border-t pt-5">
        {previous ? <Button asChild variant="outline"><a href={prepareHref(siteId, previous.id)}>Previous: {previous.title}</a></Button>
          : <Button asChild variant="outline"><a href={"/launch/site?siteId=" + scoped(siteId)}>Back to overview</a></Button>}
        {next ? <Button asChild><a href={prepareHref(siteId, next.id)}>Continue: {next.title}<ArrowRight aria-hidden="true" /></a></Button>
          : <Button asChild><a href={"/launch/site?siteId=" + scoped(siteId) + "&module=open"}>Review Launch requirements<ArrowRight aria-hidden="true" /></a></Button>}
      </nav>
    </div>
  </WorkspaceShell>;
}
