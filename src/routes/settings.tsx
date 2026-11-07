import { createFileRoute, Link } from "@tanstack/react-router";
import { useWorkspaceSession } from "@/components/shell/WorkspaceSession";
import { WorkspaceShell } from "@/components/workspace";
import { ArrowRight, BookOpen, Globe, GraduationCap, School, UserRound, Users } from "lucide-react";
import type { ReactNode } from "react";

/** Navigation only. All edits stay in their verified canonical owning journeys.
 * A saved draft is NOT an approved application, qualification or school opening. */
export const Route = createFileRoute("/settings")({ component: SettingsHome });

function EditDestination({ title, description, children, icon }: {
  title: string; description: string; children: ReactNode; icon: ReactNode;
}) {
  return <article className="flex flex-wrap items-center gap-4 border border-border bg-card p-5">
    <span className="flex size-11 shrink-0 items-center justify-center border border-border bg-muted">{icon}</span>
    <div className="min-w-0 flex-1">
      <h2 className="font-serif text-2xl">{title}</h2>
      <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
    </div>
    {children}
  </article>;
}
const actionClass="inline-flex min-h-11 items-center gap-2 border border-primary px-4 py-2 text-sm font-semibold text-primary hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
function SettingsHome() {
  const { session } = useWorkspaceSession();
  if (!session?.authenticated) return <WorkspaceShell title="Settings" width="reading">
    <p role="status" className="border bg-card p-5 text-sm">Sign in to an authorized school workspace to review your settings. <Link to="/access" className="underline">Sign in</Link></p>
  </WorkspaceShell>;
  const role = session.role;
  // The session's Site scope is only a navigation hint; the destination server
  // validates the exact Site/Program grant and relationship for every edit.
  const siteId = session.activeContext.siteIds.length === 1 ? session.activeContext.siteIds[0] : undefined;
  const schoolAdmin = role === "registrar" || role === "site_admin";
  const websiteEditor = role === "site_website_editor";
  const family = role === "guardian";
  const student = role === "student";
  const staff = ["teacher","room_facilitator","site_staff","site_leader","specialist","counselor","paraeducator"].includes(role);
  return <WorkspaceShell eyebrow="Your workspace" title="Settings" width="wide"
    subtitle="Return to the same authorized records whenever your school's information or your preferences change. No second onboarding record is created.">
    <div className="mt-7 grid gap-4">
      {schoolAdmin && <EditDestination title="School setup" icon={<School className="size-5"/>}
        description="Revise school identity, programs, calendars and launch preparation through your existing school setup journey. Saving a draft does not authorize opening.">
        <Link className={actionClass} to="/launch/school" search={{siteId,step:"school"}}>Edit school setup <ArrowRight className="size-4"/></Link>
      </EditDestination>}
      {schoolAdmin && siteId && <EditDestination title="School profile" icon={<School className="size-5"/>}
        description="Review your current school's Site identity, address, organization and verified academic programs without selecting the school again.">
        <Link className={actionClass} to="/sites/$siteId/profile" params={{siteId}}>School profile <ArrowRight className="size-4"/></Link>
      </EditDestination>}
      {schoolAdmin && <EditDestination title="School website" icon={<Globe className="size-5"/>}
        description="Review the Site's website and current publication status. Unaffiliated Site Administrators manage their school branding, content and publication directly.">
        <Link className={actionClass} to="/launch/website" search={{siteId}}>Manage school website <ArrowRight className="size-4"/></Link>
      </EditDestination>}
      {websiteEditor && <EditDestination title="Website design and content" icon={<Globe className="size-5"/>}
        description="Reopen the full Website Launch Studio to change templates, colors, approved imagery, copy or public references. Save a private draft, preview and request publication separately.">
        <Link className={actionClass} to="/launch/website" search={{siteId}}>Edit school website <ArrowRight className="size-4"/></Link>
      </EditDestination>}
      {family && <EditDestination title="Family applications" icon={<Users className="size-5"/>}
        description="Resume a draft, review child documents and continue authorized enrollment requests. Submitted applications follow the school's separate correction and review process.">
        <Link className={actionClass} to="/launch/family" search={{step:"application"}}>Family applications <ArrowRight className="size-4"/></Link>
      </EditDestination>}
      {student && <EditDestination title="Student profile and course choices" icon={<GraduationCap className="size-5"/>}
        description="Update supported profile fields, view registered courses and use the school's authorized course-request process.">
        <Link className={actionClass} to="/launch/student" search={{step:"profile"}}>Student onboarding <ArrowRight className="size-4"/></Link>
      </EditDestination>}
      {student && <EditDestination title="Display preferences" icon={<BookOpen className="size-5"/>}
        description="Change workspace density, motion and learning-display preferences.">
        <Link className={actionClass} to="/student/settings">Edit preferences <ArrowRight className="size-4"/></Link>
      </EditDestination>}
      {staff && <EditDestination title="Staff onboarding and qualifications" icon={<UserRound className="size-5"/>}
        description="Return to your assigned staff journey and submit required qualification evidence through the existing verification service.">
        <Link className={actionClass} to="/launch/staff" search={{step:"details"}}>Staff setup <ArrowRight className="size-4"/></Link>
      </EditDestination>}
      {(staff || schoolAdmin || websiteEditor) && <EditDestination title="My profile" icon={<UserRound className="size-5"/>}
        description="View your verified identity and school relationships, and update the profile fields your role permits.">
        <Link className={actionClass} to="/profiles">Open my profile <ArrowRight className="size-4"/></Link>
      </EditDestination>}
    </div>
    <p className="mt-6 border-t border-border pt-5 text-xs leading-5 text-muted-foreground">
      Re-entering a setup journey does not restart or approve it. Official school records, submitted applications,
      teaching credentials, student course decisions and publishing remain controlled by their original server-side permissions and review rules.
    </p>
  </WorkspaceShell>;
}
