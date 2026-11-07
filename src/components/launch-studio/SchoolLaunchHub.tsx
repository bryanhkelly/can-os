import { Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, BookOpen, CalendarDays, Globe, Megaphone, Mail, ShieldCheck, Users } from "lucide-react";
import { PageFrame, PageHeader } from "@/components/workspace";
import { schoolHubModules, schoolHubSections, type SchoolHubModule } from "@/domain/school-launch-hub";
import type { listLaunchOptions } from "@/modules/programs/launch.functions";

export type SchoolHubOptions = Awaited<ReturnType<typeof listLaunchOptions>>;
const icons = { website: Globe, team: Users, promote: Megaphone, recruitment: Mail, events: CalendarDays, academics: BookOpen, compliance: ShieldCheck };
export function SchoolLaunchHub({ options, siteId, module }: { options: SchoolHubOptions; siteId?: string; module?: SchoolHubModule }) {
  const site = options.sites.find(item => item.id === siteId);
  if (!site) return <PageFrame width="wide"><PageHeader eyebrow="School preparation" title="Choose your school" subtitle="Open the Launch Hub for an authorized school." />
    {siteId ? <p role="alert" className="mt-6 border bg-card p-5">This school is unavailable in your current workspace. Select an authorized school explicitly.</p> : null}
    <div className="mt-6 grid gap-4 sm:grid-cols-2">{options.sites.map(item => <Link key={item.id} to="/launch/hub/school" search={{siteId:item.id}} className="flex min-h-20 items-center justify-between border bg-card p-5 font-semibold">{item.name}<ArrowRight className="size-4 text-primary" /></Link>)}</div>
    {!options.sites.length && <Link to="/launch/school" search={{step:"school"}} className="mt-6 inline-flex min-h-11 items-center gap-2 text-primary">Create your school profile <ArrowRight className="size-4" /></Link>}
  </PageFrame>;
  const search = {siteId:site.id};
  const selected = module ? schoolHubModules[module] : null;
  return <PageFrame width="wide" className="launch-studio-page">
    {module && <Link to="/launch/hub/school" search={search} className="mb-6 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="size-4" /> Launch Hub</Link>}
    <div className="flex flex-wrap items-start justify-between gap-5"><PageHeader eyebrow={module ? "School preparation / Launch module" : "School preparation / Launch Hub"} title={selected?.title ?? "Build your school."} subtitle={selected?.description ?? "Work on these modules in any order. Your saved work stays with your school."} />
      <Link to="/sites/$siteId/profile" params={{siteId:site.id}} className="border bg-card px-5 py-4 text-sm"><strong className="block">{site.name}</strong><span className="mt-1 block text-xs text-muted-foreground">View school profile →</span></Link></div>
    {!module ? <>
      <div className="mt-6 border-l-2 border-primary bg-accent p-5 text-sm"><strong>{options.schoolSetupAdministrator ? "You are the Site Administrator." : "Your school preparation workspace."}</strong><p className="mt-1 text-muted-foreground">Manage your authorized school work and delegation. Opening authorization is tracked separately.</p></div>
      <div className="mt-8 space-y-9">{schoolHubSections.map(section => <section key={section.title} aria-label={section.title}>
        <h2 className="font-serif text-3xl">{section.title}</h2><p className="mt-2 text-sm text-muted-foreground">{section.description}</p>
        <div className={`mt-4 grid gap-4 ${section.modules.length === 1 ? "" : section.modules.length === 4 ? "sm:grid-cols-2 xl:grid-cols-4" : "sm:grid-cols-2"}`}>{section.modules.map(key => {const item=schoolHubModules[key]; const Icon=icons[key];return <article key={key} className="flex min-h-56 flex-col border bg-card p-6">
          <Icon aria-hidden="true" className="size-9 border border-primary/20 bg-accent p-2 text-primary" />
          <h3 className="mt-4 text-base font-semibold">{item.title}</h3><p className="mb-6 mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>
          {key === "website" && site.websiteDraft && <p className="mb-3 text-xs text-muted-foreground">{site.websiteDraft.status === "published" ? "Website published" : "Website draft saved"}</p>}
          <Link to="/launch/hub/school/$module" params={{module:key}} search={search} className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Open module <ArrowRight className="size-4" /></Link>
        </article>;})}</div></section>)}</div>
      <p className="mt-6 text-xs leading-5 text-muted-foreground">These are independent workstreams. Website publication, promotion and family interest do not authorize school opening.</p>
    </> : <SchoolModuleHome module={module} siteId={site.id} />}
    <section id="launch-help" className="mt-8 border-t pt-5 text-sm text-muted-foreground">Need help? Contact your CAN school support team about setup or independent review.</section>
  </PageFrame>;
}
function SchoolModuleHome({ module, siteId }: {module:SchoolHubModule;siteId:string}) {
  const item=schoolHubModules[module];
  const actionClass="mt-6 inline-flex min-h-11 items-center gap-2 bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground";
  const resources = module === "promote" ? ["School logo and approved photography", "Social graphics and suggested captions", "Printable flyers and QR codes", "School introduction and published website link"] : module === "recruitment" ? ["Share your school vision", "Collect prospective-family interest", "Plan follow-up with interested families"] : module === "events" ? ["Information sessions", "Open houses and campus tours", "Family registration and follow-up"] : [];
  return <div className="mt-7 grid gap-5 lg:grid-cols-[2fr_1fr]"><section className="border bg-card p-6 sm:p-8">
    <h2 className="font-serif text-3xl">{module === "promote" ? "Give your school a voice." : "Your next step"}</h2>
    {resources.length ? <><p className="mt-3 text-sm leading-6 text-muted-foreground">{module === "promote" ? "A dedicated place for promotional materials using your school's saved branding and information." : "This module landing page is ready. Site-level tools are planned; no action here sends invitations or creates registrations."}</p>
      <ul className="mt-5 divide-y border-y">{resources.map(resource=><li key={resource} className="py-4 text-sm">{resource}</li>)}</ul>
      <p role="status" className="mt-5 border bg-muted p-4 text-sm">{module === "promote" ? "Media-kit downloads and asset creation are not available yet." : "Site-level tools coming soon."}</p></> : <>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">{item.description} Continue in the existing authorized workspace; saved records remain attached to this school.</p>
      {module === "team" ? <Link to="/admin" search={{siteId,inviteRole:"registrar"}} className={actionClass}>Invite team member <ArrowRight className="size-4" /></Link> : "step" in item ? <Link to="/launch/school" search={{siteId,step:item.step}} className={actionClass}>{item.action}<ArrowRight className="size-4" /></Link> : null}
    </>}
  </section><aside className="border bg-card p-6"><h2 className="font-serif text-2xl">{module === "compliance" ? "Independent review" : module === "academics" ? "CAN's instructional model" : "Keep building"}</h2><p className="mt-3 text-sm leading-6 text-muted-foreground">{module === "compliance" ? "Submitting evidence does not approve opening. CAN and applicable external reviewers verify requirements through the existing opening process." : module === "academics" ? "Instruction uses asynchronous content with live support for questions. Your school provides local supervision and community." : "You can work on other modules while this work is underway. Promotion and interest are separate from applications, enrollment and permission to open."}</p><Link to="/launch/hub/school" search={{siteId}} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Back to Launch Hub <ArrowRight className="size-4" /></Link></aside></div>;
}
