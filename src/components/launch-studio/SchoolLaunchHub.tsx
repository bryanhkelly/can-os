import { useSchoolConfigurationNavigation } from "./SchoolConfigurationContext";
import type { ReactNode } from "react";
import type { SchoolHubStatus } from "@/domain/school-hub-status";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Globe, Info, Megaphone, Mail, School, ShieldCheck, Users } from "lucide-react";
import { PageFrame, PageHeader } from "@/components/workspace";
import { schoolHubModules, schoolHubSections, isPlannedSchoolHubModule, type PlannedSchoolHubModule, type SchoolHubModule } from "@/domain/school-launch-hub";
import type { listLaunchOptions } from "@/modules/programs/launch.functions";

export type SchoolHubOptions = Awaited<ReturnType<typeof listLaunchOptions>>;
const icons = { profile: School, information: Info, website: Globe, team: Users, promote: Megaphone, recruitment: Mail, events: CalendarDays, academics: BookOpen, compliance: ShieldCheck };
export function SchoolLaunchHub({ options, siteId, module, statuses, workflow, selectionError }: { statuses?: Partial<Record<SchoolHubModule,SchoolHubStatus>>; workflow?:ReactNode; options: SchoolHubOptions; siteId?: string; module?: SchoolHubModule; selectionError?:string|null }) {
  const site = options.sites.find(item => item.id === siteId);
  if (!site) return <PageFrame width="wide"><PageHeader eyebrow="School preparation" title="Choose your school" subtitle="Open the Launch Hub for an authorized school." />
    {siteId ? <p role="alert" className="mt-6 border bg-card p-5">{selectionError ?? "This school is unavailable in your current workspace. Select an authorized school explicitly."}</p> : null}
    <div className="mt-6 grid gap-4 sm:grid-cols-2">{options.sites.map(item => <Link key={item.id} to="/launch/hub/school" search={{siteId:item.id}} className="flex min-h-20 items-center justify-between border bg-card p-5 font-semibold">{item.name}<ArrowRight className="size-4 text-primary" /></Link>)}</div>
    {options.canCreateSite && <Link to="/launch/hub/school/new" className="mt-6 inline-flex min-h-11 items-center gap-2 text-primary">Create your school profile <ArrowRight className="size-4" /></Link>}
  </PageFrame>;
  const search = {siteId:site.id};
  const selected = module ? schoolHubModules[module] : null;
  return <PageFrame width="wide" className="launch-studio-page">
    {module && <Link to="/launch/hub/school" search={search} className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="size-4" /> Launch Hub</Link>}
    <div className="flex flex-wrap items-start justify-between gap-5"><PageHeader eyebrow={module ? "School preparation / Launch module" : "School preparation / Launch Hub"} title={selected?.title ?? "Build your school."} subtitle={selected?.description ?? "Work on these modules in any order. Your saved work stays with your school."} />
      <Link to="/sites/$siteId/profile" params={{siteId:site.id}} className="border bg-card px-5 py-4 text-sm"><strong className="block">{site.name}</strong><span className="mt-1 block text-xs text-muted-foreground">View school profile →</span></Link></div>
    {!module ? <>
      {selectionError&&<p role="alert" className="mt-6 border p-4 text-sm">{selectionError}</p>}
      <div className="mt-6 border-l-2 border-primary bg-accent p-5 text-sm"><strong>{options.schoolSetupAdministrator ? "You are the Site Administrator." : "Your school preparation workspace."}</strong><p className="mt-1 text-muted-foreground">Manage your authorized school work and delegation. Opening authorization is tracked separately.</p></div>
      <div className="mt-8 space-y-9">{schoolHubSections.map(section => <section key={section.title} aria-label={section.title}>
        <h2 className="font-serif text-3xl">{section.title}</h2><p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
        <div className={`mt-4 grid gap-4 ${section.modules.length === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : section.modules.length === 3 ? "sm:grid-cols-2 xl:grid-cols-3" : "sm:grid-cols-2"}`}>{section.modules.map(key => {const item=schoolHubModules[key]; const Icon=icons[key];return <article key={key} className="flex min-h-56 flex-col border bg-card p-6">
          <Icon aria-hidden="true" className="size-9 border border-primary/20 bg-accent p-2 text-primary" />
          <h3 className="mt-4 text-base font-semibold">{item.title}</h3><p className="mb-6 mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
          {statuses?.[key] && <ModuleStatus status={statuses[key]!}/> }
          {key === "website" && statuses?.website?.state !== "Blocked" && statuses?.website?.state !== "Unavailable"
            ? <Link to="/launch/website" search={{siteId:site.id,returnToHub:true}} className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Open Website &amp; Brand Studio <ArrowRight className="size-4" /></Link>
            : <Link to="/launch/hub/school/$module" params={{module:key}} search={search} className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
              {key === "website" ? "Review website access" : key === "profile" ? "Open school profile" : key === "information" ? "Add Site information" : statuses?.[key]?.state === "Planned" ? "Explore module" : "Open module"} <ArrowRight className="size-4" />
            </Link>}
        </article>;})}</div></section>)}</div>
      <p className="mt-6 text-xs leading-5 text-muted-foreground">These are independent workstreams. Website publication, promotion and family interest do not authorize school opening.</p>
    </> : <>{statuses?.[module] && <div className="mt-5"><ModuleStatus status={statuses[module]!}/></div>}{isPlannedSchoolHubModule(module)
      ? <SchoolModuleHome module={module} siteId={site.id}/>
      : workflow ?? <p role="alert" className="mt-6 border p-5">This module has no configured workflow. Contact CAN support rather than opening an unrelated setup page.</p>}</>}
    <section id="launch-help" className="mt-8 border-t pt-5 text-sm text-muted-foreground">Need help? Contact your CAN school support team about setup or independent review.</section>
  </PageFrame>;
}
type PlannedCapability = {title:string;detail:string};
const plannedModuleLanding: Record<PlannedSchoolHubModule, {intro:string; capabilities:readonly PlannedCapability[]; note:string}> = {
  promote:{
    intro:"Give your school a recognizable presence with an approved set of visual assets and shareable messages.",
    capabilities:[
      {title:"School media kit",detail:"Bring the approved logo, colors, story and rights-cleared photography together."},
      {title:"Digital campaigns",detail:"Prepare social graphics, captions and links that lead to your school website."},
      {title:"Printable materials",detail:"Create flyers, invitations and QR codes for local gatherings."},
      {title:"Review and distribution",detail:"Separate promotional copy from academic claims and opening authorization."},
    ],
    note:"Asset creation, downloads and campaign distribution are not implemented. Nothing is created or published here.",
  },
  recruitment:{
    intro:"Collect prospective-family interest and organize follow-up without confusing it with official applications or enrollment.",
    capabilities:[
      {title:"Family interest",detail:"Give prospective families a clear way to express interest in your school."},
      {title:"Invitations",detail:"Invite families and track responses within the authorized school."},
      {title:"Recruitment pipeline",detail:"Organize follow-up and next steps while protecting family information."},
    ],
    note:"Site-level recruitment forms, invitation sending and follow-up records are not enabled in this module.",
  },
  events:{
    intro:"Host interest meetings, campus tours, open houses and other opportunities for families to learn about your school.",
    capabilities:[
      {title:"Plan events",detail:"Set an event format, date, location and capacity."},
      {title:"Register families",detail:"Offer event registration without treating attendance as enrollment."},
      {title:"Follow up",detail:"Keep attendee questions and subsequent communication connected to the school."},
    ],
    note:"Event creation, registration and notifications are not enabled in this module.",
  },
};
export function SchoolModuleHome({ module, siteId }: {module:PlannedSchoolHubModule;siteId:string}) {
  const navigation=useSchoolConfigurationNavigation();
  const plan=plannedModuleLanding[module];
  return <section className="mt-7 grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]" aria-label={`${schoolHubModules[module].title} overview`}>
    <div className="border bg-card p-6 sm:p-8">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Planned capability · not yet operational</p>
      <h2 className="mt-3 font-serif text-3xl">What this module will make possible</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{plan.intro}</p>
      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        {plan.capabilities.map(capability=><article key={capability.title} className="border bg-background p-5">
          <h3 className="font-semibold">{capability.title}</h3>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">{capability.detail}</p>
        </article>)}
      </div>
      <p role="status" className="mt-6 border bg-muted p-4 text-sm">{plan.note}</p>
    </div>
    <aside className="border bg-card p-6">
      <h2 className="font-serif text-2xl">Continue building your school</h2>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">This is a dedicated landing page for future development. Other modules remain available, but no actions or records are simulated here.</p>
      <Link to={navigation.homePath} search={{siteId}} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">
        Back to {navigation.homeLabel} <ArrowRight className="size-4"/>
      </Link>
    </aside>
  </section>;
}

export function ModuleStatus({status}:{status:SchoolHubStatus}) {
  const color=status.state==="Complete"?"text-success":status.state==="Attention Needed"||status.state==="Blocked"?"text-warning":"text-muted-foreground";
  return <div className="mb-4 text-xs leading-5"><span className={`inline-block border bg-muted px-2 py-1 font-semibold ${color}`}>{status.state}</span><p className="mt-2">{status.detail}</p>{status.state!=="Planned"&&<p className="mt-1 font-semibold">Next: {status.nextAction}</p>}</div>;
}
