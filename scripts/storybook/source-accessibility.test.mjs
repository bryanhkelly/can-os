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
