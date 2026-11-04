import type { ReactNode } from "react";
import wallpaper from "@/assets/student-dashboard-wallpaper.jpg";
import { DashboardLayout, DashboardPanel } from "./dashboard-layout";

export function DashboardHero({ title, subtitle, eyebrow, date }: {
  title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; date?: ReactNode;
}) {
  return <section className="can-dashboard-hero" style={{ backgroundImage: `url("${wallpaper}")` }}
    aria-label="Dashboard overview">
    <div className="relative">
      <p className="student-dashboard-date">{date}{date && eyebrow ? " " : null}
        {date ? <span>{eyebrow}</span> : eyebrow}</p>
      <h1>{title}</h1>
      {subtitle && <div className="max-w-2xl text-sm leading-6">{subtitle}</div>}
    </div>
  </section>;
}

export function DashboardHome({ title, subtitle, eyebrow, shortcuts, actions, rail, priority, children }: {
  title: ReactNode; subtitle?: ReactNode; eyebrow?: ReactNode; shortcuts: ReactNode;
  actions?: ReactNode; rail?: ReactNode; priority?: ReactNode; children: ReactNode;
}) {
  return <main className="can-dashboard-page min-h-screen min-w-0 bg-background text-foreground">
    {priority && <div className="mx-auto max-w-[1510px] space-y-4 py-5">{priority}</div>}
    <DashboardLayout className="role-dashboard"
      wallpaper={<DashboardHero title={title} subtitle={subtitle} eyebrow={eyebrow} />}
      quickActions={shortcuts} primary={children}
      rail={rail || actions ? <>{rail}{actions && <DashboardPanel title="Workspace connections">
        <div className="flex flex-col items-start gap-3 text-sm [&_a]:max-w-full [&_a]:whitespace-normal">{actions}</div>
      </DashboardPanel>}</> : undefined}
    />
  </main>;
}
