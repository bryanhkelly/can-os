import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { EntityCard, RecordHeader, RecordLayout } from "./record-layout";
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
    header={<RecordHeader eyebrow="Admissions / APP-2026-1042" title="Avery Kelly" subtitle="Valor Academy · Grade 9 · Application submitted October 29" status={<StatusBadge tone="attention">Review required</StatusBadge>}
      actions={<Button variant="outline">Review evidence</Button>} breadcrumbs={<a href="#applications" className="underline">← Applications</a>} />}
    navigation={<><a href="#overview" aria-current="page" className="border-b-2 border-primary px-3 py-2 text-sm font-semibold text-primary">Overview</a>
      <a href="#documents" className="px-3 py-2 text-sm text-muted-foreground">Documents</a>
      <a href="#history" className="px-3 py-2 text-sm text-muted-foreground">History</a></>}
    main={<DashboardPanel title="Application information" id="overview"><p className="text-sm text-muted-foreground">Keep the applicant and authorized next action visible on arrival; no unrelated create form above this record.</p></DashboardPanel>}
    rail={<DashboardPanel title="Next action"><p className="text-xs text-muted-foreground">Guardian evidence requires authorized registrar review.</p></DashboardPanel>}
    activity={<><h2 className="text-sm font-semibold">Activity</h2><p className="mt-2 text-xs text-muted-foreground">Submission and review history from canonical events.</p></>}
  />
</div> };
