import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, Globe2, ShieldCheck, Users, CalendarDays, GraduationCap } from "lucide-react";
import type { listLaunchOptions, listLaunches } from "@/modules/programs/launch.functions";
import { programTypeLabels } from "@/domain/program-offerings";

type Site=Awaited<ReturnType<typeof listLaunchOptions>>["sites"][number];
type Program=Awaited<ReturnType<typeof listLaunches>>["launches"][number];
type State="ready"|"empty"|"unauthorized"|"unavailable";

/** A read-only handoff. Canonical Offering and release authorization are not
 * inferred from private Site interests or legacy school launch records. */
export function SiteLaunchActivationPanel({siteId,site,programs,readState}:{
  siteId:string;site:Site|null;programs:Program[]|null;readState:State;
}) {
  const website=site?.websiteDraft?.status==="published"?"Published":site?.websiteDraft?"Private draft":"Not started";
  return <section aria-label="Site activation workspace" className="border bg-card p-6 sm:p-8">
    <p className="text-xs font-semibold uppercase tracking-wider text-primary">After the preview</p>
    <h2 className="mt-2 font-serif text-3xl">Turn plans into real learning.</h2>
    <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
      A saved Site, a published website and an enrollable program are separate approvals.
      Continue in the current governed workspaces without creating another Site.
    </p>
    <div className="mt-6 grid gap-4 lg:grid-cols-2">
      <article className="border p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><Globe2 className="size-4 text-primary"/> Site & website</h3>
        <dl className="mt-4 text-sm">
          <div className="flex justify-between gap-3"><dt>Site record</dt><dd className="font-semibold">Saved</dd></div>
          <div className="mt-3 flex justify-between gap-3"><dt>Website status</dt><dd className="font-semibold">{website}</dd></div>
        </dl>
        {site?.websiteDraft?.host&&<p className="mt-4 break-all text-xs text-muted-foreground">
          Reserved host, not necessarily reachable: {site.websiteDraft.host}
        </p>}
        <Link to="/sites/$siteId/profile" params={{siteId}} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Site details <ArrowRight className="size-4"/></Link>
      </article>
      <article className="border p-5">
        <h3 className="flex items-center gap-2 text-sm font-semibold"><BookOpen className="size-4 text-primary"/> School and enrichment launch records</h3>
        {readState==="unauthorized"||readState==="unavailable"?
          <p role="status" className="mt-4 text-sm">Program launch records are {readState==="unavailable"?"temporarily unavailable":"not authorized"}. No program absence or readiness is assumed.</p>:
          programs?.length?<ul className="mt-4 space-y-3">{programs.map(program=><li key={program.id} className="border p-3">
            <p className="font-semibold">{program.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{programTypeLabels[program.type]} · {program.status}</p>
            <Link to="/settings/school/$module" params={{module:"academics"}} search={{siteId,programId:program.id}}
              className="mt-2 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Continue setup <ArrowRight className="size-4"/></Link>
          </li>)}</ul>:
          <p className="mt-4 text-sm text-muted-foreground">No saved school launch records are visible for this Site. Canonical offerings and enrollment releases are tracked separately.</p>}
        <Link to="/settings/school/$module" params={{module:"academics"}} search={{siteId}} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Prepare academics <ArrowRight className="size-4"/></Link>
      </article>
    </div>
    <section aria-label="Launch workspaces" className="mt-7">
      <h3 className="font-serif text-2xl">Finish setting up your Site</h3>
      <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
        These actions use your existing authorized operational records, not another Launch Studio.
        Complete the work relevant to your program before requesting approval or publishing.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {([
          {title:"Website and brand",icon:Globe2,href:"website"},
          {title:"School details",icon:GraduationCap,href:"profile"},
          {title:"Team and permissions",icon:Users,href:"team"},
          {title:"Academic configuration",icon:BookOpen,href:"academics"},
          {title:"Interest events",icon:CalendarDays,href:"events"},
          {title:"Opening compliance",icon:ShieldCheck,href:"compliance"},
        ] as const).map(item=><div key={item.title} className="border bg-card p-4">
          <item.icon className="size-5 text-primary"/>
          <h4 className="mt-3 text-sm font-semibold">{item.title}</h4>
          {item.href==="website"?<Link to="/launch/website" search={{siteId,returnToHub:false}} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Open workspace <ArrowRight className="size-4"/></Link>:
           item.href==="events"?<Link to="/operations/interest-events" search={{siteId}} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Open workspace <ArrowRight className="size-4"/></Link>:
           item.href==="profile"?<Link to="/sites/$siteId/profile" params={{siteId}} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Open workspace <ArrowRight className="size-4"/></Link>:
           <Link to="/settings/school/$module" params={{module:item.href}} search={{siteId}} className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Open workspace <ArrowRight className="size-4"/></Link>}
        </div>)}
      </div>
    </section>
    <div className="mt-5 flex flex-wrap gap-3">
      <Link to="/canonical/blueprints" search={{}} className="inline-flex min-h-11 items-center gap-2 border px-4 py-3 text-sm font-semibold text-primary">Plan approved offerings <ArrowRight className="size-4"/></Link>
      <Link to="/programs/noncredit/enrollment" search={{publicSiteId:siteId}} className="inline-flex min-h-11 items-center gap-2 border px-4 py-3 text-sm font-semibold text-primary">Configure noncredit enrollment <ArrowRight className="size-4"/></Link>
    </div>
    <p className="mt-4 text-xs text-muted-foreground">The native Blueprint workspace requires separately verified canonical Site authority. Private interests do not grant a Program license, adoption, release or permission to enroll.</p>
  </section>;
}
