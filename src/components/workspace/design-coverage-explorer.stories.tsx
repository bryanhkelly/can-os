import {useState} from "react";
import type {Meta,StoryObj} from "@storybook/react-vite";
import {expect,within,userEvent} from "storybook/test";
import registry from "../../../docs/design-coverage/v61-registry.json";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Select} from "@/components/ui/select";
import {DirectoryPage,DirectoryTable} from "./directory-table";
import {StatCard} from "./stat-card";
import {StatusBadge} from "./workspace-panel";
import {WorkspaceNotice} from "./notice";
type Row=typeof registry.routes[number];
const layouts=Object.entries(registry.layouts).map(([id,label])=>({id,label}));
const PAGE_SIZE=20;
function Explorer(){
 const [query,setQuery]=useState(""),[layout,setLayout]=useState("all"),[review,setReview]=useState("all"),[page,setPage]=useState(0);
 const filtered=registry.routes.filter(row=>(layout==="all"||row.layout===layout)&&(review==="all"||row.review===review)&&row.path.toLowerCase().includes(query.trim().toLowerCase()));
 const pages=Math.max(1,Math.ceil(filtered.length/PAGE_SIZE));
 const visible=filtered.slice(page*PAGE_SIZE,(page+1)*PAGE_SIZE);
 const verified=registry.routes.filter(row=>row.review==="verified").length;
 return <DirectoryPage title="Design coverage explorer" width="wide" subtitle="Repository registry snapshot. Candidate layouts and story references are not verified production routes."
   query={query} onQueryChange={value=>{setQuery(value);setPage(0);}} searchLabel="Search route files"
   filters={<><Field label="Layout"><Select value={layout} onChange={e=>{setLayout(e.target.value);setPage(0);}}><option value="all">All layouts</option>{layouts.map(item=><option key={item.id} value={item.id}>{item.label}</option>)}</Select></Field><Field label="Review status"><Select value={review} onChange={e=>{setReview(e.target.value);setPage(0);}}><option value="all">All statuses</option><option value="unreviewed">Unreviewed</option><option value="verified">Declared verified</option><option value="boundary">Reviewed boundary</option></Select></Field></>}>
   <div className="mt-6 grid gap-3 sm:grid-cols-3">
    <StatCard label="Registered route files" value={registry.routes.length}/>
    <StatCard label="Verified route declarations" value={verified}/>
    <StatCard label="Governed layout references" value={Object.keys(registry.layoutReferences).length}/>
   </div>
   <div className="mt-4"><WorkspaceNotice tone="attention">A referenced story does not verify a production route. Independent accessibility, responsive, visual and authenticated journey evidence is required.</WorkspaceNotice></div>
   <DirectoryTable<Row> label="Route coverage" caption={filtered.length+" matching route files"} rows={visible} rowKey={row=>row.path} columns={[
    {id:"route",title:"Route",render:row=><span className="block max-w-xs [overflow-wrap:anywhere]">{row.path}</span>},
    {id:"layout",title:"Proposed layout",render:row=>layouts.find(item=>item.id===row.layout)?.label??"Boundary candidate"},
    {id:"review",title:"Review",render:row=><StatusBadge tone={row.review==="verified"?"success":"attention"}>{row.review==="verified"?"Declared verified":row.review}</StatusBadge>},
    {id:"stories",title:"Story references",render:row=><div className="max-w-sm space-y-1"><p>{row.stories.length} references</p>{row.stories.map(story=><p key={story} className="text-xs text-muted-foreground [overflow-wrap:anywhere]">{story.split("/").at(-1)}</p>)}</div>},
   ]} pagination={<div className="flex flex-wrap items-center justify-between gap-2"><Button variant="outline" disabled={page===0} onClick={()=>setPage(value=>value-1)}>Previous</Button><span className="text-sm">Page {page+1} of {pages}</span><Button variant="outline" disabled={page+1>=pages} onClick={()=>setPage(value=>value+1)}>Next</Button></div>}/>
 </DirectoryPage>;
}
const meta={title:"12 Engineering and acceptance/Coverage explorer",tags:["responsive"],parameters:{docs:{description:{component:"A read-only view of the repository route registry, built using the governed directory components."}}}} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;
export const RouteInventory:Story={render:()=> <Explorer/>,play:async({canvasElement})=>{
 const c=within(canvasElement);
 await expect(c.getByText("Registered route files")).toBeVisible();
 await userEvent.type(c.getByRole("searchbox",{name:"Search route files"}),"calendar");
 await expect(c.getByText("src/routes/calendar.tsx",{exact:true})).toBeVisible();
 await userEvent.clear(c.getByRole("searchbox",{name:"Search route files"}));
 await userEvent.type(c.getByRole("searchbox",{name:"Search route files"}),"__no_matching_route__");
 await expect(c.getByText("No records on this page.")).toBeVisible();
}};
