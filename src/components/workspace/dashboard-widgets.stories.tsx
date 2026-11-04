import type { Meta, StoryObj } from "@storybook/react-vite";
import { DashboardProgress, DashboardTimeline, DashboardPreviewList, DashboardMediaTile } from "./dashboard-widgets";
import { DashboardPanel } from "./dashboard-layout";
import { StatusBadge } from "./workspace-panel";

const meta = { title: "V6.1 templates/Dashboard widgets", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const StudentDashboardWidgets: Story = { render: () => <div className="grid gap-4 bg-background p-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
  <div className="space-y-4">
    <DashboardPanel title="Continue Learning">
      <h3 className="font-semibold">Algebra II</h3>
      <p className="mt-1 text-xs text-muted-foreground">Linear equations and functions · Illustrative course</p>
      <DashboardProgress label="Course progress" value={4} max={8} description="Lesson 4 of 8" className="mt-4" />
    </DashboardPanel>
    <DashboardPanel title="Upcoming assignments">
      <DashboardPreviewList items={[
        { id: "english", title: "English essay draft", description: "English · Due today", href: "#english", status: <StatusBadge tone="attention">Due today</StatusBadge> },
        { id: "science", title: "Science lab", description: "Science · Due Friday", href: "#science", status: <StatusBadge>In progress</StatusBadge> },
      ]} />
    </DashboardPanel>
    <DashboardPanel title="School life">
      <div className="grid gap-3 md:grid-cols-3">
        <DashboardMediaTile title="Chapel & spiritual life" subtitle="Community and encouragement" href="#chapel" />
        <DashboardMediaTile title="Spring arts showcase" subtitle="Creative opportunities" href="#arts" />
        <DashboardMediaTile title="Serve together" subtitle="Make a difference" href="#service" />
      </div>
    </DashboardPanel>
  </div>
  <div className="space-y-4">
    <DashboardPanel title="Upcoming classes">
      <DashboardTimeline entries={[
        { id: "a", time: "8:00 AM", title: "Chapel", description: "Sanctuary" },
        { id: "b", time: "9:00 AM", title: "English", description: "Room 102", href: "#english" },
        { id: "c", time: "10:30 AM", title: "Mathematics", description: "Room 204", href: "#math" },
      ]}/>
    </DashboardPanel>
    <DashboardPanel title="Announcements"><DashboardPreviewList items={[
      { id: "show", title: "Spring arts showcase", description: "Published school announcement", href: "#show" },
      { id: "registration", title: "Course registration", description: "See official school dates", href: "#registration" },
    ]}/></DashboardPanel>
  </div>
</div> };

export const MissingData: Story = { render: () => <div className="max-w-xl space-y-5 bg-background p-5">
  <DashboardPanel title="Unverified progress"><DashboardProgress label="Course progress" value={-1} max={0}/></DashboardPanel>
  <DashboardPanel title="Schedule"><DashboardTimeline entries={[]}/></DashboardPanel>
  <DashboardPanel title="Next actions"><DashboardPreviewList items={[]}/></DashboardPanel>
</div> };
