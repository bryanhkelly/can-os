import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
const state=vi.hoisted(()=>({search:{} as Record<string,unknown>,module:"team",data:null as any,role:"site_admin",siteIds:[] as string[],load:vi.fn(),invalidate:vi.fn(),updateIdentity:vi.fn(),updateInformation:vi.fn(),saveIdentity:null as null|((identity:{name:string;timezone:string},revision:string,reason:string)=>Promise<void>)}));
vi.mock("@tanstack/react-router",()=>({
 createFileRoute:()=> (options:object)=>({options,useSearch:()=>state.search,useParams:()=>({module:state.module}),useLoaderData:()=>state.data}),
 notFound:()=>new Error("Not found"),useRouter:()=>({invalidate:state.invalidate}),
 Navigate:({to,search}:{to:string;search?:Record<string,unknown>})=>{
  const query=new URLSearchParams(Object.entries(search??{}).map(([key,value])=>[key,String(value)]));
  return <a href={to+(query.size?"?"+query.toString():"")}>Redirect to Website Studio</a>;
 },
 Link:({to,params,search,children}:{to:string;params?:Record<string,string>;search?:Record<string,unknown>;children:ReactNode})=>{
  const path=to.replace(/\$([^/]+)/g,(_,key:string)=>params?.[key]??key);
  const query=new URLSearchParams(Object.entries(search??{}).filter(([,value])=>value!==undefined).map(([key,value])=>[key,String(value)])).toString();
  return <a href={path+(query?`?${query}`:"")}>{children}</a>;
 },
}));
vi.mock("@/components/shell/WorkspaceSession",()=>({useWorkspaceSession:()=>({session:{authenticated:true,role:state.role,activeContext:{siteIds:state.siteIds}}})}));
vi.mock("@/modules/programs/school-configuration-loader",()=>({loadSchoolConfiguration:state.load}));
vi.mock("@/routes/admin",()=>({ScopedAdminConsole:({selection}:{selection:{siteId:string}})=><p>Team records for {selection.siteId}</p>}));
vi.mock("@/components/operations/LaunchWizardPage",()=>({LaunchWizardPage:()=>null}));
vi.mock("@/components/operations/LaunchAcademicSetupWorkspace",()=>({LaunchAcademicSetupWorkspace:()=>null}));
vi.mock("@/components/operations/LaunchPreparationWorkspace",()=>({LaunchPreparationWorkspace:()=>null}));
vi.mock("@/components/operations/SchoolOpeningEvidencePanel",()=>({SchoolOpeningEvidencePanel:()=>null}));
vi.mock("@/hooks/useWorkspaceMutation",()=>({useWorkspaceMutation:({invalidateRouter,mutationFn}:{invalidateRouter:()=>Promise<unknown>;mutationFn:(input:any)=>Promise<unknown>})=>({submit:async(input:any)=>{if(typeof input==="function")await input();else await mutationFn(input);await invalidateRouter?.();return {status:"completed"};},isSubmitting:false,refreshError:null,retryRefresh:vi.fn()})}));
vi.mock("@/modules/programs/site-configuration.functions",()=>({updateLaunchSiteIdentity:state.updateIdentity,updateLaunchSiteAddress:vi.fn(),updateLaunchSiteContact:vi.fn(),updateLaunchSiteInformation:state.updateInformation}));
vi.mock("@/components/operations/LaunchSiteIdentityEditor",()=>({LaunchSiteIdentityEditor:({initial,save}:any)=>{state.saveIdentity=save;return <p>Saved name: {initial.name}</p>;}}));
vi.mock("@/components/operations/LaunchSiteAddressEditor",()=>({LaunchSiteAddressEditor:()=>null}));
vi.mock("@/components/operations/LaunchSiteContactEditor",()=>({LaunchSiteContactEditor:()=>null}));
import { SchoolConfigurationContextProvider } from "@/components/launch-studio/SchoolConfigurationContext";
import { LaunchCreatedHandoff } from "@/components/operations/LaunchCreatedHandoff";
import { Route as Settings } from "@/routes/settings";
import { Route as SettingsModule } from "@/routes/settings_.school.$module";
import { Route as LaunchModule } from "@/routes/launch.hub.school_.$module";
const siteId="00000000-0000-4000-8000-000000000001";
const otherSite="00000000-0000-4000-8000-000000000002";
const revision="2026-11-06T00:00:00.000Z";
const site={id:siteId,name:"Saved School",slug:"saved-school",timezone:"America/Los_Angeles",updatedAt:revision,address:null,contactDraft:null,siteInformationDraft:null};
beforeEach(()=>{
 vi.clearAllMocks();state.search={siteId};state.module="team";state.role="site_admin";state.siteIds=[siteId];state.saveIdentity=null;
 state.data={ok:true,data:{options:{sites:[site,{...site,id:otherSite,name:"Another School"}]},launches:[],statuses:null,selectedProgramId:null}};
});
describe("dashboard school configuration",()=>{
 it("links all school settings to the same selected Site without sending administrators to Launch",()=>{
  const html=renderToStaticMarkup(<Settings.options.component/>);
  for(const module of ["profile","information","website","team","promote","recruitment","events","academics","compliance"])
   expect(html).toContain(`/settings/school/${module}?siteId=${siteId}`);
  expect(html).toContain("Explore module");
  expect(html).not.toContain('/launch/school');
 });
 it.each(["promote","recruitment","events"] as const)("opens %s as a scoped, nonoperational Settings landing page",module=>{
  state.module=module;
  const html=renderToStaticMarkup(<SettingsModule.options.component/>);
  expect(html).toContain("What this module will make possible");
  expect(html).toContain(`/settings?siteId=${siteId}`);
  expect(html).not.toContain("<button");
 });
 it("keeps the team workflow and return link in Settings",()=>{
  const html=renderToStaticMarkup(<SettingsModule.options.component/>);
  expect(html).toContain(`Team records for ${siteId}`);
  expect(html).toContain(`/settings/school/team?siteId=${siteId}&amp;teamMode=invite`);
  expect(html).toContain(`/settings?siteId=${siteId}`);
  expect(html).not.toContain('/launch/');
 });
 it("opens Site Information as a scoped setup editor",()=>{
  state.module="information";
  const html=renderToStaticMarkup(<SettingsModule.options.component/>);
  expect(html).toContain("Site Information");
  expect(html).toContain("Microschool");
  expect(html).toContain("Homeschool or cooperative");
  expect(html).toContain("Current website (optional)");
  expect(html).toContain("These descriptions do not establish legal status");
 });
 it("opens the canonical website editor in the dashboard and preserves its return context",()=>{
  state.module="website";
  const html=renderToStaticMarkup(<SettingsModule.options.component/>);
  expect(html).toContain(`/launch/website?siteId=${siteId}`);
  expect(html).toContain("returnToSettings=true");
  expect(html).not.toContain('/site-website');
 });
 it("redirects an authorized Website module and explains blocked access",()=>{
  state.module="website";
  state.data.data.statuses={website:{state:"Not Started",detail:"No private address yet",nextAction:"Prepare website"}};
  expect(renderToStaticMarkup(<SettingsModule.options.component/>))
    .toContain(`/launch/website?siteId=${siteId}&amp;returnToSettings=true`);
  state.data.data.statuses={website:{state:"Blocked",detail:"Network authorization required",nextAction:"Request access"}};
  const blocked=renderToStaticMarkup(<SettingsModule.options.component/>);
  expect(blocked).toContain("Network authorization required");
  expect(blocked).not.toContain("/launch/website?");
 });
 it("requires explicit Site selection rather than opening another school's configuration",()=>{
  state.search={};state.siteIds=[siteId,otherSite];
  const html=renderToStaticMarkup(<SettingsModule.options.component/>);
  expect(html).toContain("Choose your school");expect(html).not.toContain("Team records for");
  expect(html).toContain(`/settings/school/team?siteId=${otherSite}`);
 });
 it("loads identical canonical configuration for Launch and Settings",async()=>{
  const args={deps:{siteId,programId:otherSite},params:{module:"academics"}} as any;
  state.load.mockResolvedValue(state.data.data);
  await expect(SettingsModule.options.loader!(args)).resolves.toEqual(state.data);
  await expect(LaunchModule.options.loader!(args)).resolves.toEqual(state.data);
  expect(state.load.mock.calls).toEqual([[args.deps,"academics"],[args.deps,"academics"]]);
 });
 it("updates the existing Site with its saved revision and refreshes it",async()=>{
  state.module="profile";
  expect(renderToStaticMarkup(<SettingsModule.options.component/>)).toContain("Saved name: Saved School");
  await state.saveIdentity!({name:"Updated School",timezone:site.timezone},revision,"Corrected display name");
  expect(state.updateIdentity).toHaveBeenCalledWith({data:{siteId,name:"Updated School",timezone:site.timezone,expectedRevision:revision,changeReason:"Corrected display name"}});
  expect(state.invalidate).toHaveBeenCalledOnce();
 });
});

it("keeps saved Program recovery links in the Settings context",()=>{
 const html=renderToStaticMarkup(<SchoolConfigurationContextProvider value="settings"><LaunchCreatedHandoff created={{programId:otherSite,journeyId:"journey",programType:"full_school",publicSiteDraft:{siteId,host:"saved-school.example.test",status:"draft",created:false}}}/></SchoolConfigurationContextProvider>);
 expect(html).toContain(`/settings/school/academics?siteId=${siteId}&amp;programId=${otherSite}`);
 expect(html).toContain(`/settings/school/compliance?siteId=${siteId}&amp;programId=${otherSite}`);
 expect(html).not.toContain("/launch/school");
});
it("keeps personal settings available without showing school configuration to guardians",()=>{
 state.role="guardian";
 const html=renderToStaticMarkup(<Settings.options.component/>);
 expect(html).toContain("Family applications");
 expect(html).not.toContain("/settings/school/");
});
