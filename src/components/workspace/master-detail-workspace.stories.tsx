import type { Meta, StoryObj } from "@storybook/react-vite";
import { MasterDetailWorkspace, MasterDetailListItem } from "./master-detail-workspace";
import { StatusBadge } from "./workspace-panel";
import { Button } from "@/components/ui/button";

const meta = { title: "V6.1 templates/Master detail explorer", parameters: { layout: "fullscreen" } } satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

export const AdmissionsQueue: Story = { render: () => <div className="bg-background p-4 sm:p-8">
  <MasterDetailWorkspace title="Admissions review" mobileMode="detail" description="Select a student and work immediately in the same viewport."
    toolbar={<Button variant="outline">Filter applications</Button>}
    list={<div>
      <MasterDetailListItem selected title="Avery Kelly" description="Valor Academy · Grade 9" href="?application=avery" status={<StatusBadge tone="attention">Review</StatusBadge>} />
      <MasterDetailListItem title="Jordan Ellis" description="Riverside · Grade 10" href="?application=jordan" status={<StatusBadge>Submitted</StatusBadge>} />
      <MasterDetailListItem title="Maya Bennett" description="Valor Academy · Grade 7" href="?application=maya" status={<StatusBadge tone="success">Offer</StatusBadge>} />
    </div>}
    detail={<div className="space-y-5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-xs text-muted-foreground">APP-2026-1042 · Valor Academy</p><h2 className="mt-2 font-serif text-3xl">Avery Kelly</h2></div>
        <StatusBadge tone="attention">Evidence review</StatusBadge>
      </div>
      <div className="border border-border p-4"><p className="text-sm font-semibold">Next: verify guardian documentation</p><p className="mt-2 text-xs text-muted-foreground">Assigned to the registrar. No approval implied by a completed checklist.</p></div>
      <Button>Open authorized review</Button>
    </div>}
    footer="Illustrative records: the real route must preserve URL search/filter state and server authorization."
  />
</div> };
