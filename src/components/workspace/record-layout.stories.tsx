import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { EntityCard, RecordHeader, RecordLayout, RecordFacts } from "./record-layout";
import { DashboardPanel } from "./dashboard-layout";
import { StatusBadge } from "./workspace-panel";
import { Button } from "@/components/ui/button";

const meta = { title: "V6.1 templates/Directories and records", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const SchoolSiteDirectory: Story = { render: () => <div className="bg-background p-5 sm:p-8">
  <RecordHeader eyebrow="Network / Sites" title="Your school sites" subtitle="Choose a site to view current authorized operations and programs."/>
  <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
    <EntityCard title="Valor Academy" subtitle="Oakland, California" meta="Pacific time" status={<StatusBadge>Site record</StatusBadge>}
      leading={<span aria-hidden="true" className="flex size-11 items-center justify-center border bg-muted font-semibold">V</span>}
      openLabel="Site Today" href="#valor">
      Church partner information, programs and operations belong to the selected site record.
    </EntityCard>
    <EntityCard title="Riverside Learning Center" subtitle="Sacramento, California" meta="Pacific time" status={<StatusBadge tone="attention">Review needed</StatusBadge>} href="#riverside">
      The status example is illustrative and would be supplied by an authorized service.
    </EntityCard>
    <EntityCard title="Northside Church School" subtitle="San Jose, California" meta="Pacific time" status={<StatusBadge>Draft</StatusBadge>} href="#northside">
      Configuration progress is distinct from operational approval.
    </EntityCard>
  </div>
</div>,
  play: async ({ canvas }) => {
    const card = canvas.getByRole("link", { name: /Valor Academy/ });
    await expect(card).toHaveStyle({ display: "flex", flexDirection: "column", borderRadius: "0px" });
    await card.focus();
    await expect(card).toHaveFocus();
  },
};

export const ApplicantRecord: Story = { render: () => <div className="bg-background p-5 sm:p-8">
  <RecordLayout
    header={<RecordHeader eyebrow="Admissions / APP-2026-1042" title="Avery Kelly" focusOnMount subtitle="Valor Academy · Grade 9 · Application submitted October 29" leading={<span role="img" aria-label="Avery Kelly: no profile photo" className="flex size-16 items-center justify-center border bg-muted">AK</span>} status={<StatusBadge tone="attention">Review required</StatusBadge>}
      actions={<Button variant="outline">Review evidence</Button>} breadcrumbs={<a href="#applications" className="underline">← Applications</a>} />}
    navigation={<><a href="#overview" aria-current="page" className="border-b-2 border-primary px-3 py-2 text-sm font-semibold text-primary">Overview</a>
      <a href="#documents" className="px-3 py-2 text-sm text-muted-foreground">Documents</a>
      <a href="#history" className="px-3 py-2 text-sm text-muted-foreground">History</a></>}
    main={<DashboardPanel title="Application information" id="overview"><p className="mb-4 text-sm text-muted-foreground">Keep the applicant and authorized next action visible on arrival; no unrelated create form above this record.</p><RecordFacts label="Application facts" columns={3} items={[{label:"School",value:"Valor Academy"},{label:"Grade",value:"9"},{label:"Application state",value:"Review required"}]}/></DashboardPanel>}
    railLabel="Application review context" rail={<DashboardPanel title="Next action"><p className="text-xs text-muted-foreground">Guardian evidence requires authorized registrar review.</p></DashboardPanel>}
    activityLabel="Application history" activity={<><h2 className="text-sm font-semibold">Activity</h2><p className="mt-2 text-xs text-muted-foreground">Submission and review history from canonical events.</p></>}
  />
</div>,
  play: async ({ canvas }) => {
    const heading = canvas.getByRole("heading", { name: "Avery Kelly" });
    const eyebrow = canvas.getByText("Admissions / APP-2026-1042");
    const portrait = canvas.getByRole("img", { name: "Avery Kelly: no profile photo" });
    await expect(heading.getBoundingClientRect().left).toBe(eyebrow.getBoundingClientRect().left);
    await expect(heading).toHaveFocus();
    await expect(canvas.getByRole("group", { name: "Record actions" })).toContainElement(canvas.getByRole("button", { name: "Review evidence" }));
    await expect(canvas.getByLabelText("Application facts")).toBeVisible();
    await expect(canvas.getByRole("complementary", { name: "Application review context" })).toBeVisible();
    await expect(portrait).toHaveStyle({ borderRadius: "0px" });
    await expect(portrait.getBoundingClientRect().width).toBe(portrait.getBoundingClientRect().height);
  },
};

export const CompactRecordFacts: Story = {
  render: () => <div className="grid max-w-4xl gap-6 bg-background p-5 sm:grid-cols-2 sm:p-8">
    <div className="border bg-card p-5">
      <h2 className="mb-4 font-semibold">Program record</h2>
      <RecordFacts label="Program metadata" items={[
        {label:"Site",value:"Westside Learning Center"},
        {label:"Program",value:"After-school digital skills"},
        {label:"Dates",value:"January through March"},
        {label:"Availability",value:<StatusBadge tone="attention">Pending authorization</StatusBadge>},
      ]}/>
    </div>
    <div className="border bg-card p-5">
      <h2 className="mb-4 font-semibold">Action record</h2>
      <RecordFacts label="Action metadata" columns={3} items={[
        {label:"Type",value:"Evidence review"},
        {label:"Priority",value:"High"},
        {label:"Due",value:"Not scheduled"},
      ]}/>
    </div>
  </div>,
  play: async ({ canvas }) => {
    await expect(canvas.getByLabelText("Program metadata")).toBeVisible();
    await expect(canvas.getByLabelText("Action metadata")).toHaveClass("sm:grid-cols-3");
  },
};

export const SchoolDayEvidenceTiles: Story = {
  render: () => <div className="max-w-3xl bg-background p-5 sm:p-8">
    <h2 className="text-lg font-semibold">First-day verification preview</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      These example values are not attendance, supervised presence, opening approval or custody release.
    </p>
    <RecordFacts label="School-day verification evidence" variant="tiles" columns={3}
      className="mt-4 gap-2" items={[
        {id:"expected",label:"Expected onsite",value:"Yes"},
        {id:"staffing",label:"Reviewed staffing plan",value:"Ready"},
        {id:"attendance",label:"Observed attendance",value:"Not yet observable"},
      ]}/>
  </div>,
  play: async ({ canvas }) => {
    const facts = canvas.getByLabelText("School-day verification evidence");
    await expect(facts).toHaveClass("sm:grid-cols-3");
    await expect(canvas.getByText("Not yet observable")).toBeVisible();
    await expect(canvas.getByText(/These example values are not attendance/)).toBeVisible();
  },
};
