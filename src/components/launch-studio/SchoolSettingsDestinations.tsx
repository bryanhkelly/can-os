import { Link } from "@tanstack/react-router";
import { ArrowRight, BookOpen, CalendarDays, Globe, Mail, Megaphone, School, ShieldCheck, Users } from "lucide-react";
import { schoolSettingsModules } from "@/domain/school-configuration";
const icons={profile:School,website:Globe,team:Users,promote:Megaphone,recruitment:Mail,events:CalendarDays,academics:BookOpen,compliance:ShieldCheck};
export function SchoolSettingsDestinations({siteId}:{siteId?:string}) {
 return <section aria-label="School configuration" className="mt-7"><h2 className="font-serif text-3xl">School Settings</h2><p className="mt-2 text-sm text-muted-foreground">Manage the same school profile and configuration prepared during launch.</p>
  <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{(Object.keys(schoolSettingsModules) as (keyof typeof schoolSettingsModules)[]).map(module=>{const item=schoolSettingsModules[module];const Icon=icons[module];return <article key={module} className="flex flex-col border bg-card p-5"><Icon className="size-8 border bg-muted p-1.5 text-primary" aria-hidden="true"/><h3 className="mt-3 font-semibold">{item.title}</h3><p className="mb-4 mt-2 text-sm leading-6 text-muted-foreground">{item.description}</p>{module==="website" && siteId
    ? <Link to="/settings/school/$module" params={{module}} search={{siteId}} className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">Open Website Studio <ArrowRight className="size-4"/></Link>
    : <Link to="/settings/school/$module" params={{module}} search={{siteId}} className="mt-auto inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-primary">{["promote","recruitment","events"].includes(module) ? "Explore module" : "Manage"} <ArrowRight className="size-4"/></Link>}</article>;})}</div>
 </section>;
}
