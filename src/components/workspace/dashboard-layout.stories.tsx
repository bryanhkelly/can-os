import type { Meta, StoryObj } from "@storybook/react-vite";
import { BookOpen, CalendarDays, Users } from "lucide-react";
import { DailyCanvas } from "@/components/student/DailyCanvas";
import { resolveEditorialCanvas } from "@/domain/editorial-campaigns";
import { DashboardLayout, DashboardPanel, DashboardShortcut } from "./dashboard-layout";
import { StatCard } from "./stat-card";
import { StatusBadge } from "./workspace-panel";

const meta = { title: "V6.1 templates/Role dashboards", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;
const now = new Date("2026-11-03T12:00:00Z");

export const StudentHome: Story = { render: () => <div className="bg-background p-4 sm:p-6">
  <DashboardLayout
    wallpaper={<DailyCanvas audience="student" content={{
      ...resolveEditorialCanvas("student", now)!,
      campaignLabel: "Verse of the day",
      headline: "Good morning, Jordan.",
      supportingCopy: "Let your light shine before others.",
      verseReference: "Matthew 5:16",
    }} />}
    quickActions={<>
      <DashboardShortcut title="Continue learning" description="Pick up your next lesson" icon={<BookOpen className="size-5" />}><a href="#learning" /></DashboardShortcut>
      <DashboardShortcut title="Assignments" description="Review your due work" icon={<BookOpen className="size-5" />}><a href="#assignments" /></DashboardShortcut>
      <DashboardShortcut title="Today's schedule" description="See your classes" icon={<CalendarDays className="size-5" />}><a href="#schedule" /></DashboardShortcut>
      <DashboardShortcut title="School life" description="Clubs and community" icon={<Users className="size-5" />}><a href="#school-life" /></DashboardShortcut>
    </>}
    primary={<>
      <DashboardPanel title="Continue learning" id="learning" action={<a href="#assignments" className="font-semibold text-primary">All courses →</a>}>
        <h3 className="text-lg font-semibold">Algebra II</h3>
        <p className="text-sm text-muted-foreground">Linear equations · Next lesson available</p>
        <div className="mt-3 h-1.5 w-full bg-muted"><div className="h-1.5 w-1/2 bg-primary" /></div>
        <p className="mt-2 text-xs text-muted-foreground">50% course progress · Illustrative only</p>
      </DashboardPanel>
      <DashboardPanel title="Upcoming assignments" id="assignments">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 text-sm"><span>English essay draft</span><StatusBadge tone="attention">Due today</StatusBadge></div>
        <div className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"><span>Science lab report</span><StatusBadge>In progress</StatusBadge></div>
      </DashboardPanel>
      <DashboardPanel title="School life" id="school-life">
        <p className="text-sm text-muted-foreground">Approved chapel, clubs, events and service opportunities appear here.</p>
      </DashboardPanel>
    </>}
    rail={<>
      <DashboardPanel title="This week" id="schedule">
        <p className="text-sm text-muted-foreground">Calendar events loaded from the authorized student schedule.</p>
      </DashboardPanel>
      <DashboardPanel title="Announcements">
        <p className="text-sm text-muted-foreground">Published school and network announcements.</p>
      </DashboardPanel>
    </>}
  />
</div> };

export const SiteLeader: Story = { render: () => <div className="bg-background p-5">
  <DashboardLayout
    wallpaper={<DailyCanvas audience="site" content={resolveEditorialCanvas("site", now)} />}
    primary={<DashboardPanel title="Opening decision">
      <StatusBadge tone="attention">Review required</StatusBadge>
      <p className="mt-3 text-sm text-muted-foreground">Only an authoritative site-opening service may determine whether the site is permitted to operate.</p>
    </DashboardPanel>}
    rail={<DashboardPanel title="Site context"><StatCard label="Assigned programs" value="3" hint="Illustrative" /></DashboardPanel>}
  />
</div> };
