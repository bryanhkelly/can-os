import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SchoolLaunchHub, type SchoolHubOptions } from "@/components/launch-studio/SchoolLaunchHub";
vi.mock("@tanstack/react-router", () => ({
  Link: ({children,to,search,params}:{children:ReactNode;to:string;search?:{siteId?:string};params?:{module?:string}}) => <a href={`${to.replace("$module",params?.module ?? "")}?siteId=${search?.siteId ?? ""}`}>{children}</a>,
}));
const siteId="00000000-0000-4000-8000-000000000001";
const options={sites:[{id:siteId,name:"Test School",websiteDraft:null}],schoolSetupAdministrator:true} as unknown as SchoolHubOptions;
describe("school Launch Hub",()=>{
  it("opens all seven modules under the selected school without claiming completion",()=>{
    const html=renderToStaticMarkup(<SchoolLaunchHub options={options} siteId={siteId}/>);
    expect((html.match(/Open module/g) ?? []).length).toBe(7);
    expect(html).toContain("Build Your School Community");
    expect(html).toContain(`/launch/hub/school/promote?siteId=${siteId}`);
    expect(html).not.toContain("100%");
    expect(html).not.toContain("Not Started");
  });
  it("never silently substitutes the only authorized school for a missing or invalid selection",()=>{
    for(const selection of [undefined,"another-school"]){
      const html=renderToStaticMarkup(<SchoolLaunchHub options={options} siteId={selection}/>);
      expect(html).toContain("Choose your school");
      expect(html).not.toContain("Open module");
    }
  });
  it.each(["promote","recruitment","events"] as const)("makes the %s placeholder honest and retains its return scope",module=>{
    const html=renderToStaticMarkup(<SchoolLaunchHub options={options} siteId={siteId} module={module}/>);
    expect(html).toContain(`/launch/hub/school?siteId=${siteId}`);
    expect(html).toContain(module === "promote" ? "not available yet" : "coming soon");
    expect(html).not.toContain("<button");
  });
});
