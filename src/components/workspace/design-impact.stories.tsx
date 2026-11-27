import {useState} from "react";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,userEvent,within} from "storybook/test";
import snapshot from "virtual:becomuna-engineering-inventory";
import {WorkspaceShell} from "./workspace-shell";
import {DashboardPanel} from "./dashboard-layout";
import {StatCard} from "./stat-card";
import {WorkspaceNotice} from "./notice";
import {DirectoryWindowPagination} from "./directory-window-pagination";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Button} from "@/components/ui/button";
import {Table,TableBody,TableCell,TableHead,TableHeader,TableRow,TableRowHead} from "@/components/ui/table";

const report=snapshot.impact;
const pageSize=12;
function ImpactDashboard(){
 const [query,setQuery]=useState("");
 const [scope,setScope]=useState("shared");
 const [page,setPage]=useState(0);
 const [selected,setSelected]=useState<string|null>(null);
 const [routePage,setRoutePage]=useState(0);
 const filtered=report.components.filter(row=>(scope==="all"||row.shared)&&(scope!=="gaps"||(row.routeCount>0&&row.storyFamilyCount===0))&&row.path.toLowerCase().includes(query.trim().toLowerCase()));
 const current=filtered.find(row=>row.path===selected)??filtered[0];
 const routes=current?.routePaths.slice(routePage*pageSize,(routePage+1)*pageSize)??[];
 const reset=()=>{setPage(0);setRoutePage(0);setSelected(null);};
 return <WorkspaceShell eyebrow="Engineering and acceptance" title="Component change impact" subtitle="Static dependency inventory · V6.1" width="wide">
  <div className="mt-6 space-y-5">
   <DashboardPanel title="Source identity" description="This describes the source used to generate the catalog, not a publication or approval receipt.">
    <p className="text-sm">Source commit: <code className="break-all font-mono">{snapshot.source.commit}</code></p>
    <p className="mt-2 text-sm text-muted-foreground">{snapshot.source.clean?"Clean source at snapshot generation":"Modified source at snapshot generation — not release evidence"}</p>
   </DashboardPanel>
   <WorkspaceNotice>Static imports indicate potential change impact, not proof of runtime use or individual story coverage.</WorkspaceNotice>
   <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
    <StatCard label="Registered source routes" value={report.routeCount}/>
    <StatCard label="Component modules" value={report.componentModuleCount}/>
    <StatCard label="Story families" value={report.storyFamilyCount}/>
    <StatCard label="Shared route dependencies without a story family" value={report.sharedWithoutStoryFamilies}/>
   </div>
   <DashboardPanel title="Component inventory" description="Sorted by dependent source routes. Select a module to inspect potential impact.">
    <div className="grid gap-3 sm:grid-cols-2">
     <Field label="Find component"><Input value={query} onChange={event=>{setQuery(event.target.value);reset();}} placeholder="Filter by source path"/></Field>
     <Field label="Component scope"><Select value={scope} onChange={event=>{setScope(event.target.value);reset();}}><option value="shared">Shared modules</option><option value="all">All component modules</option><option value="gaps">Shared modules without importing stories</option></Select></Field>
    </div>
    <p role="status" className="my-3 text-sm text-muted-foreground">{filtered.length? "Showing "+(page*pageSize+1)+"–"+Math.min((page+1)*pageSize,filtered.length)+" of "+filtered.length+" modules":"No modules match this filter."}</p>
    <Table aria-label="Component dependency counts" scrollLabel="Scrollable component dependency counts">
     <TableHeader><TableRow><TableHead>Module</TableHead><TableHead>Routes</TableHead><TableHead>Story families</TableHead><TableHead>Inspect</TableHead></TableRow></TableHeader>
     <TableBody>{filtered.slice(page*pageSize,(page+1)*pageSize).map(row=><TableRow key={row.path}><TableRowHead className="break-all">{row.path}</TableRowHead><TableCell>{row.routeCount}</TableCell><TableCell>{row.storyFamilyCount}</TableCell><TableCell><Button size="sm" variant={current?.path===row.path?"outline-selected":"outline"} aria-pressed={current?.path===row.path} aria-label={"Inspect "+row.path} onClick={()=>{setSelected(row.path);setRoutePage(0);}}>Inspect</Button></TableCell></TableRow>)}</TableBody>
    </Table>
    <div className="mt-3"><DirectoryWindowPagination label="Component inventory" pageIndex={page} hasMore={(page+1)*pageSize<filtered.length} onPageChange={setPage}/></div>
   </DashboardPanel>
   {current&&<DashboardPanel title="Selected component impact" description={current.path}>
    <div className="grid gap-3 sm:grid-cols-3">
     <StatCard label="Dependent routes" value={current.routeCount}/>
     <StatCard label="Importing story families" value={current.storyFamilyCount}/>
     <StatCard label="Routes without matching registered family" value={current.routesWithoutLinkedFamily.length}/>
    </div>
    <h3 className="mb-2 mt-5 font-semibold">Affected route review</h3>
    <Table aria-label="Affected source routes" scrollLabel="Scrollable affected source routes">
     <TableHeader><TableRow><TableHead>Source route</TableHead><TableHead>Linked family</TableHead><TableHead>Declared review</TableHead></TableRow></TableHeader>
     <TableBody>{routes.map(path=><TableRow key={path}><TableRowHead className="break-all">{path}</TableRowHead><TableCell>{current.routesWithoutLinkedFamily.includes(path)?"No matching family":"Matching family"}</TableCell><TableCell>{report.routes.find(row=>row.path===path)?.review??"Unregistered"}</TableCell></TableRow>)}</TableBody>
    </Table>
    <div className="mt-3"><DirectoryWindowPagination label="Affected routes" pageIndex={routePage} hasMore={(routePage+1)*pageSize<current.routeCount} onPageChange={setRoutePage}/></div>
    <h3 className="mb-2 mt-5 font-semibold">Importing story families</h3>
    {current.storyFamilies.length?<ul className="space-y-1 text-sm">{current.storyFamilies.map(path=><li key={path} className="break-all">{path}</li>)}</ul>:<p className="text-sm text-muted-foreground">No importing story family identified.</p>}
   </DashboardPanel>}
   <DashboardPanel title="Inventory limitations"><ul className="space-y-2 text-sm text-muted-foreground">{report.limitations.map(item=><li key={item}>{item}</li>)}</ul></DashboardPanel>
  </div>
 </WorkspaceShell>;
}
const meta={id:"v61-component-impact",title:"12 Engineering and acceptance/Component change impact",component:ImpactDashboard} satisfies Meta<typeof ImpactDashboard>;
export default meta;
type Story=StoryObj<typeof meta>;
export const Inventory:Story={play:async({canvasElement})=>{
 const canvas=within(canvasElement);
 const inventory=within(canvas.getByRole("region",{name:"Component inventory"}));
 const query=inventory.getByRole("textbox",{name:"Find component"});
 await userEvent.type(query,"src/components/ui/button.tsx");
 const target=report.components.find(row=>row.path==="src/components/ui/button.tsx");
 if(!target)throw Error("Canonical Button is absent from the inventory");
 await expect(inventory.getByRole("status")).toHaveTextContent("of 1 modules");
 const detail=within(canvas.getByRole("region",{name:"Selected component impact"}));
 await expect(detail.getByText(target.path,{exact:true})).toBeVisible();
 await expect(detail.getByRole("table",{name:"Affected source routes"})).toBeVisible();
 await userEvent.clear(query);
 await userEvent.type(query,"no-such-module-for-acceptance");
 await expect(inventory.getByRole("status")).toHaveTextContent("No modules match");
 await expect(canvas.queryByRole("region",{name:"Selected component impact"})).not.toBeInTheDocument();
}};
export const Dark:Story={globals:{theme:"dark"}};
