import {useState} from "react";
import type {Meta, StoryObj} from "@storybook/react-vite";
import {expect, userEvent, within} from "storybook/test";
import registry from "../../../docs/design-coverage/v61-registry.json";
import {adoptionSummary} from "@/domain/v61-adoption-summary";
import {WorkspaceShell} from "./workspace-shell";
import {DashboardPanel} from "./dashboard-layout";
import {StatCard} from "./stat-card";
import {WorkspaceNotice} from "./notice";
import {Field} from "@/components/ui/field";
import {Select} from "@/components/ui/select";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow,TableRowHead} from "@/components/ui/table";
import {DirectoryWindowPagination} from "./directory-window-pagination";

const summary = adoptionSummary(registry);
const pageSize=12;
function DesignAdoptionDashboard(){
 const [layout,setLayout]=useState("all");
 const [status,setStatus]=useState("pending");
 const [page,setPage]=useState(0);
 const rows=summary.rows.filter(row=>(layout==="all"||row.layoutKey===layout)&&
   (status==="all"||(status==="pending"&&!row.complete&&!row.boundary)||(status==="linked"&&row.linked)||(status==="complete"&&row.complete)));
 const shown=rows.slice(page*pageSize,(page+1)*pageSize);
 return <WorkspaceShell eyebrow="Engineering and acceptance" title="Design system adoption" subtitle="V6.1 route registry · source declarations from this build" width="wide">
  <div className="mt-6 space-y-5">
   <WorkspaceNotice tone="info">These are registry declarations, not runtime compliance. Linked stories and complete review declarations do not prove authenticated page behavior or reviewed visual evidence.</WorkspaceNotice>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Registered routes" value={summary.total} hint="Includes non-page candidates."/>
    <StatCard label="Routes with linked stories" value={summary.linked} hint="At least one declared story reference."/>
    <StatCard label="Complete review declarations" value={summary.complete} hint="All required declarations present."/>
    <StatCard label="Outstanding route reviews" value={summary.pending} hint="Excludes reviewed non-page boundaries."/>
   </div>
   <DashboardPanel title="Layout coverage" description={summary.layoutReferences+" of "+summary.layouts+" layouts have a reference story; "+summary.boundary+" reviewed non-page boundaries."}>
    <Table aria-label="Layout coverage counts" scrollLabel="Scrollable layout coverage counts">
     <TableHeader><TableRow><TableHead>Layout</TableHead><TableHead>Routes</TableHead><TableHead>Linked</TableHead><TableHead>Complete</TableHead><TableHead>Outstanding</TableHead></TableRow></TableHeader>
     <TableBody>{summary.groups.filter(group=>group.total>0).map(group=><TableRow key={group.key}><TableRowHead>{group.label}</TableRowHead><TableCell>{group.total}</TableCell><TableCell>{group.linked}</TableCell><TableCell>{group.complete}</TableCell><TableCell>{group.pending}</TableCell></TableRow>)}</TableBody>
    </Table>
   </DashboardPanel>
   <DashboardPanel title="Route review queue" description="Filter the registry to find missing evidence and story links. This read-only report does not approve a route.">
    <div className="grid gap-3 sm:grid-cols-2">
     <Field label="Layout"><Select value={layout} onChange={event=>{setLayout(event.target.value);setPage(0);}}><option value="all">All layouts</option>{summary.groups.filter(group=>group.total>0).map(group=><option key={group.key} value={group.key}>{group.label}</option>)}</Select></Field>
     <Field label="Review filter"><Select value={status} onChange={event=>{setStatus(event.target.value);setPage(0);}}><option value="pending">Outstanding</option><option value="all">All routes</option><option value="linked">With linked stories</option><option value="complete">Complete declarations</option></Select></Field>
    </div>
    <p role="status" className="my-3 text-sm text-muted-foreground">{rows.length? "Showing "+(page*pageSize+1)+"–"+Math.min((page+1)*pageSize,rows.length)+" of "+rows.length+" routes":"No routes match this filter."}</p>
    <Table aria-label="Route review records" scrollLabel="Scrollable route review records">
     <TableHeader><TableRow><TableHead>Source route</TableHead><TableHead>Story references</TableHead><TableHead>Missing declarations</TableHead></TableRow></TableHeader>
     <TableBody>{shown.map(row=><TableRow key={row.path}><TableRowHead className="break-all">{row.path}</TableRowHead><TableCell>{row.stories.length}</TableCell><TableCell>{row.boundary?"Reviewed boundary":row.missing.length?row.missing.join(", "):"None declared missing"}</TableCell></TableRow>)}</TableBody>
    </Table>
    <div className="mt-3"><DirectoryWindowPagination label="Route reviews" pageIndex={page} hasMore={(page+1)*pageSize<rows.length} onPageChange={setPage}/></div>
   </DashboardPanel>
  </div>
 </WorkspaceShell>;
}
const meta={id:"v61-design-system-adoption",title:"12 Engineering and acceptance/Design system adoption",component:DesignAdoptionDashboard} satisfies Meta<typeof DesignAdoptionDashboard>;
export default meta;
type Story=StoryObj<typeof meta>;
export const RegistryOverview:Story={play:async({canvasElement})=>{
 const canvas=within(canvasElement);
 const queue=within(canvas.getByRole("region",{name:"Route review queue"}));
 await expect(queue.getByRole("table",{name:"Route review records"})).toBeVisible();
 await userEvent.selectOptions(queue.getByRole("combobox",{name:"Review filter"}),"linked");
 await expect(queue.getByRole("status")).toHaveTextContent(summary.linked?"of "+summary.linked+" routes":"No routes match");
 await expect(queue.getByRole("button",{name:"Previous"})).toBeDisabled();
 if(summary.linked>pageSize){
   await userEvent.click(queue.getByRole("button",{name:"Next"}));
   await expect(queue.getByRole("status")).toHaveTextContent("Showing "+(pageSize+1));
 }
 await userEvent.selectOptions(queue.getByRole("combobox",{name:"Review filter"}),"complete");
 await expect(queue.getByRole("status")).toHaveTextContent(summary.complete?"of "+summary.complete+" routes":"No routes match");
}};
export const Dark:Story={globals:{theme:"dark"}};
