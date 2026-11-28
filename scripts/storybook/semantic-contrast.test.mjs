import {test} from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {contrastRatio} from "../../src/domain/color-contrast.ts";
const css=readFileSync(new URL("../../src/styles.css",import.meta.url),"utf8");
const brand=readFileSync(new URL("../../src/design-system/brand-theme.tsx",import.meta.url),"utf8");
function palette(scope){
 const section=css.split("\n"+scope+" {")[1]?.split("\n}")[0];
 assert.ok(section,"Missing "+scope);
 return Object.fromEntries([...section.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6});/gi)].map(m=>[m[1],m[2]]));
}
const surfaces=["background","card","muted","accent"];
for(const scope of [":root",".dark"])test("semantic contrast: "+scope,()=>{
 const colors=palette(scope),violations=[];
 function check(f,b,min){
  assert.ok(colors[f]&&colors[b],"Missing color token "+f+" or "+b);
  const ratio=contrastRatio(colors[f],colors[b]);
  if(ratio<min)violations.push(f+" on "+b+": "+ratio.toFixed(3)+" < "+min);
 }
 for(const f of ["primary","foreground","muted-foreground","success","warning","danger","info","destructive","workspace-accent-ink"])for(const b of surfaces)check(f,b,4.5);
 for(const f of ["input","ring"])for(const b of surfaces)check(f,b,3);
 for(const [f,b] of [["primary-foreground","primary"],["destructive-foreground","destructive"],["secondary-foreground","secondary"],["accent-foreground","accent"],["card-foreground","card"],["popover-foreground","popover"],["sidebar-primary","sidebar"],["sidebar-primary-foreground","sidebar-primary"],["sidebar-accent-foreground","sidebar-accent"],["workspace-accent-ink","workspace-accent-soft"]])check(f,b,4.5);
 assert.deepEqual(violations,[]);
});
test("fallback brand matches the audited light semantic tokens",()=>{
 const section=brand.split("export const defaultBrandTokens: BrandTokens = {")[1]?.split("};")[0];
 assert.ok(section);
 const values=Object.fromEntries([...section.matchAll(/(\w+):\s*"(#[0-9a-f]{6})"/gi)].map(m=>[m[1],m[2]]));
 const light=palette(":root");
 for(const [key,token] of [["primary","primary"],["primaryForeground","primary-foreground"],["accent","accent"],["accentForeground","accent-foreground"]])assert.equal(values[key],light[token],key);
});

test("scoped theme aliases are recomputed rather than inheriting light-mode colors",()=>{
 for(const scope of [":root",".dark",'[data-can-brand="true"]','.dark [data-can-brand="true"], .dark[data-can-brand="true"]']){
  const section=css.split("\n"+scope+" {")[1]?.split("\n}")[0];
  assert.ok(section,scope);
  assert.match(section,/--eyebrow-color:\s*var\(--workspace-accent-ink\)/,scope);
  assert.match(section,/--workspace-accent:\s*var\(--(?:brand-)?primary\)/,scope);
 }
});
