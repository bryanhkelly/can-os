import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { SchoolLaunchHub, type SchoolHubOptions } from "@/components/launch-studio/SchoolLaunchHub";
import { schoolHubSearch } from "@/domain/school-launch-hub";
import { SchoolSettingsDestinations } from "@/components/launch-studio/SchoolSettingsDestinations";
vi.mock("@tanstack/react-router", () => ({
  Link: ({children,to,search,params}:{children:ReactNode;to:string;search?:{siteId?:string;returnToHub?:boolean;returnToSettings?:boolean};params?:{module?:string}}) => {
    const query = new URLSearchParams();
    if(search?.siteId)query.set("siteId",search.siteId);
    if(search?.returnToHub)query.set("returnToHub","true");
    if(search?.returnToSettings)query.set("returnToSettings","true");
    return <a href={`${to.replace("$module",params?.module ?? "")}?${query}`}>{children}</a>;
  },
}));
const siteId="00000000-0000-4000-8000-000000000001";
const options={sites:[{id:siteId,name:"Test School",websiteDraft:null}],schoolSetupAdministrator:true} as unknown as SchoolHubOptions;
describe("school Launch Hub",()=>{
  it("opens all seven modules under the selected school without claiming completion",()=>{
    const html=renderToStaticMarkup(<SchoolLaunchHub options={options} siteId={siteId}/>);
    expect((html.match(/Open module/g) ?? []).length).toBe(6);
    expect(html).toContain(`/launch/website?siteId=${siteId}&amp;returnToHub=true`);
    expect(html).not.toContain(`/launch/hub/school/website?siteId=${siteId}`);
    expect(html).toContain("Build Your School Community");
    expect(html).toContain(`/launch/hub/school/promote?siteId=${siteId}`);
    expect(html).toContain(`/launch/hub/school/recruitment?siteId=${siteId}`);
    expect(html).toContain(`/launch/hub/school/events?siteId=${siteId}`);
    expect(html).toContain("Promote Your School");
    expect(html).not.toContain("100%");
    expect(html).not.toContain("Not Started");
  });
  it("does not send blocked website editors into a permission error",()=>{
    const html=renderToStaticMarkup(<SchoolLaunchHub options={options} siteId={siteId}
      statuses={{website:{state:"Blocked",detail:"Network authorization required",nextAction:"Request access"}}}/>);
    expect(html).toContain("Network authorization required");
    expect(html).not.toContain("/launch/website?");
    expect(html).toContain(`/launch/hub/school/website?siteId=${siteId}`);
  });
  it("routes Settings Website through scoped authorization without an interstitial",()=>{
    const html=renderToStaticMarkup(<SchoolSettingsDestinations siteId={siteId}/>);
    expect(html).toContain(`/settings/school/website?siteId=${siteId}`);
    expect(html).not.toContain("returnToSettings=true");
    expect(html).toContain(`/settings/school/promote?siteId=${siteId}`);
    expect(html).toContain(`/settings/school/recruitment?siteId=${siteId}`);
    expect(html).toContain(`/settings/school/events?siteId=${siteId}`);
  });
  it("preserves malformed selections for explicit authorization feedback, without silently dropping them",()=>{
    const selection=schoolHubSearch.parse({siteId:"00000000-0000-4000-8000-00000000000",programId:"invalid"});
    expect(selection.siteId).toBe("00000000-0000-4000-8000-00000000000");
    expect(selection.programId).toBe("invalid");
    expect(renderToStaticMarkup(<SchoolLaunchHub options={options} siteId={selection.siteId}/>)).toContain("Choose your school");
  });
  it("never silently substitutes the only authorized school for a missing or invalid selection",()=>{
    for(const selection of [undefined,"another-school"]){
      const html=renderToStaticMarkup(<SchoolLaunchHub options={options} siteId={selection}/>);
      expect(html).toContain("Choose your school");
      expect(html).not.toContain("Open module");
    }
  });
  it("keeps all planned modules clickable while reporting their status",()=>{
    const planned={state:"Planned",detail:"Module is on the roadmap",nextAction:"Explore module"} as const;
    const html=renderToStaticMarkup(<SchoolLaunchHub options={options} siteId={siteId}
      statuses={{promote:planned,recruitment:planned,events:planned}}/>);
    expect((html.match(/Explore module/g)??[])).toHaveLength(3);
    for(const module of ["promote","recruitment","events"])expect(html).toContain(`/launch/hub/school/${module}?siteId=${siteId}`);
  });
  it.each(["promote","recruitment","events"] as const)("makes the %s placeholder honest and retains its return scope",module=>{
    const html=renderToStaticMarkup(<SchoolLaunchHub options={options} siteId={siteId} module={module}/>);
    expect(html).toContain(`/launch/hub/school?siteId=${siteId}`);
    expect(html).toContain("not enabled");
    expect(html).toContain("What this module will make possible");
    expect(html).not.toContain("<button");
  });
});
