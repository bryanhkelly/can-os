import {test} from "node:test";
import assert from "node:assert/strict";
import {inspectAccessibleActions} from "./source-accessibility.mjs";
const inspect=source=>inspectAccessibleActions(source,"src/components/example.tsx");
test("reports empty and icon-only actions without inventing labels",()=>{
 const result=inspect(`import { X, Trash2 as Remove } from "lucide-react";
 const example=()=> <><Button size="icon"><X/></Button><button><Remove aria-hidden="true"/></button><a href="/details"/><Button> </Button></>;`);
 assert.deepEqual(result.map(x=>x.tag),["Button","button","a","Button"]);
 assert.ok(result.every(x=>x.line===2&&x.kind==="missing-explicit-action-name"));
});
test("recognizes names and leaves dynamic content for rendered inspection",()=>{
 assert.deepEqual(inspect(`import { X } from "lucide-react";
 const example=()=> <><Button aria-label="Dismiss"><X/></Button><Button><span>Close</span></Button><Button {...props}/><Button>{label}</Button><Button asChild><Link>Details</Link></Button><a id="anchor"/><button title="Details"/><Button aria-labelledby={id}/></>;`),[]);
});
test("comments and literal JSX-like text are not actions; blank names are candidates",()=>{
 assert.equal(inspect(`// <Button/>
 const example="<Button/>";
 const actual=()=> <Button aria-label=" "><span aria-hidden="true">X</span></Button>;`).length,1);
});

test("known slot composers supply names to direct and conditional actions",()=>{
 const composed=[];
 const source=`import {DashboardShortcut as Shortcut} from "@/components/workspace/dashboard-layout";
 import {StatCard} from "@/components/workspace";
 const Example=()=> <><Shortcut title="Schedule"><Link to="/calendar"/></Shortcut><Shortcut title={title}>{ready?<a href="#ready"/>:<Link to="/class"/>}</Shortcut><StatCard asChild label="Classes" value={3}><Link to="/class"/></StatCard></>;`;
 assert.deepEqual(inspectAccessibleActions(source,"src/components/home/Example.tsx",{composed}),[]);
 assert.deepEqual(composed.map(row=>row.owner),["DashboardShortcut","DashboardShortcut","DashboardShortcut","StatCard"]);
});
test("unverified composition remains visible in the candidate queue",()=>{
 const composed=[];
 const source=`import {DashboardShortcut} from "./dashboard-layout";
 import {StatCard} from "./stat-card";
 import {DashboardShortcut as Other} from "./other";
 const Example=()=> <><DashboardShortcut title=""><a href="#blank"/></DashboardShortcut><DashboardShortcut title="Schedule"><div><a href="#nested"/></div></DashboardShortcut><StatCard label="Classes" value={3}><a href="#not-slotted"/></StatCard><Other title="Unknown"><a href="#other"/></Other><DashboardShortcut title="Schedule" {...props}><a href="#spread"/></DashboardShortcut></>;`;
 const result=inspectAccessibleActions(source,"src/components/workspace/Example.tsx",{composed});
 assert.equal(result.length,5);assert.deepEqual(composed,[]);
});
