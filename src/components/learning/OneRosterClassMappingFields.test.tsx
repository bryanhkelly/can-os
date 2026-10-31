import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { OneRosterClassMappingFields } from "./OneRosterClassMappingFields";

const rows = [{sourcedId:"external-a",title:"Algebra"},{sourcedId:"external-b",title:"Science"}];
const sections = [{id:"can-a",code:"MTH",title:"Math"},{id:"can-b",code:"SCI",title:"Science"}];
const render = (mappings: Record<string,string>) => renderToStaticMarkup(
  <OneRosterClassMappingFields rows={rows} sections={sections} mappings={mappings}
    busy={false} onMappingChange={()=>{}} onSave={()=>{}} />,
);

describe("OneRoster class mappings", () => {
  it("requires all external classes to be explicitly mapped", () => {
    expect(render({})).toContain('disabled=""');
    expect(render({"external-a":"can-a"})).toContain('disabled=""');
  });
  it("rejects duplicate destinations", () => {
    expect(render({"external-a":"can-a","external-b":"can-a"})).toContain('disabled=""');
  });
  it("rejects destinations outside the authorized class options", () => {
    expect(render({"external-a":"can-a","external-b":"unavailable"})).toContain('disabled=""');
  });
  it("allows complete unique mappings", () => {
    expect(render({"external-a":"can-a","external-b":"can-b"})).not.toContain('disabled=""');
  });
});
