import { useSchoolConfigurationNavigation } from "./SchoolConfigurationContext";
import type { SchoolHubStatus } from "@/domain/school-hub-status";
import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { schoolHubModules, type PlannedSchoolHubModule } from "@/domain/school-launch-hub";
import type { listLaunchOptions } from "@/modules/programs/launch.functions";
export type SchoolHubOptions = Awaited<ReturnType<typeof listLaunchOptions>>;

/** Reusable settings-only panels. The obsolete School Launch Hub screen is deleted. */
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
    note:"Branded landing, survey and email previews are available below. Consented Program-linked family invitations use the existing registrar service; pre-Program Site-level outreach is not yet enabled.",
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
      {module==="recruitment" && <section aria-label="Family brand experience" className="mt-7 border-t pt-5">
        <h3 className="font-serif text-2xl">Explore your family-facing school brand</h3>
        <p className="mt-2 text-sm text-muted-foreground">These read-only pages use your saved Website &amp; Brand design. No messages are sent and no responses are collected during previews.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {([
            ["landing","Family interest landing"],
            ["survey","Three-minute family survey"],
            ["email-survey","Survey invitation email"],
            ["email-confirmation","Interest confirmation email"],
            ["email-update","Family update email"],
          ] as const).map(([view,label]) => <a key={view}
            href={`/brand-preview?siteId=${encodeURIComponent(siteId)}&view=${view}`}
            target="_blank" rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center border bg-background px-4 py-3 text-sm font-semibold text-primary focus-visible:outline-2 focus-visible:outline-ring">
            {label} <ArrowRight className="ml-auto size-4"/>
          </a>)}
        </div>
        <Link to="/launch/website" search={{siteId,returnToHub:true}} className="mt-4 inline-flex min-h-11 items-center text-sm font-semibold text-primary">Edit your school brand <ArrowRight className="ml-2 size-4"/></Link>
      </section>}
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
