import type { ReactNode } from "react";
import wallpaper from "@/assets/student-dashboard-wallpaper.jpg";
import { DashboardLayout, DashboardPanel } from "./dashboard-layout";
import { useActiveWorkspaceMember } from "@/components/shell/workspace-session-context";
import { useHydrated } from "@/lib/use-hydrated";

/** The single Home headline pattern for every role: "Good morning, Riley." */
export function homeGreeting(hour: number | null, firstName?: string | null): string {
  const salutation = hour === null ? "Welcome" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return firstName ? `${salutation}, ${firstName}.` : `${salutation}.`;
}

function useHomeGreeting(firstName?: string | null) {
  const member = useActiveWorkspaceMember();
  const hydrated = useHydrated();
  return homeGreeting(hydrated ? new Date().getHours() : null, firstName || member?.firstName);
}

export function DashboardHero({ title, subtitle, eyebrow, date }: {
  title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; date?: ReactNode;
}) {
  return <section className="can-dashboard-hero" style={{ backgroundImage: `url("${wallpaper}")` }}
    aria-label="Dashboard overview">
    <div className="relative">
      <p className="student-dashboard-date can-eyebrow">{date}{date && eyebrow ? <span>{eyebrow}</span> : eyebrow}</p>
      <h1>{title}</h1>
      {subtitle && <div className="max-w-2xl text-sm leading-6">{subtitle}</div>}
    </div>
  </section>;
}

/**
 * Role Home. Omit `title` on a role's home route so the headline is the shared
 * greeting; pass it only for non-home dashboards such as a site record.
 * `firstName` overrides the session name when the loader has a better one.
 */
export function DashboardHome({ title, firstName, subtitle, eyebrow, shortcuts, actions, rail, priority, children }: {
  title?: ReactNode; firstName?: string | null; subtitle?: ReactNode; eyebrow?: ReactNode; shortcuts: ReactNode;
  actions?: ReactNode; rail?: ReactNode; priority?: ReactNode; children: ReactNode;
}) {
  const greeting = useHomeGreeting(firstName);
  return <main className="can-dashboard-page min-h-screen min-w-0 bg-background text-foreground">
    {priority && <div className="max-w-[var(--content-dashboard)] space-y-4 py-5">{priority}</div>}
    <DashboardLayout className="role-dashboard"
      wallpaper={<DashboardHero title={title ?? greeting} subtitle={subtitle} eyebrow={eyebrow} />}
      quickActions={shortcuts} primary={children}
      rail={rail || actions ? <>{rail}{actions && <DashboardPanel title="Workspace connections">
        <div className="flex flex-col items-start gap-3 text-sm [&_a]:max-w-full [&_a]:whitespace-normal">{actions}</div>
      </DashboardPanel>}</> : undefined}
    />
  </main>;
}
