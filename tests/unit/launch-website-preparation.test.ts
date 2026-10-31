import {beforeEach,describe,expect,it,vi} from "vitest";
const state=vi.hoisted(()=>({rows:[] as any[],actor:{} as any,catalog:vi.fn(),local:vi.fn(),requireActor:vi.fn()}));
vi.mock("@/db/client",()=>({db:{select:()=>{const query:any={from:()=>query,innerJoin:()=>query,where:()=>query,limit:async()=>state.rows.shift()??[]};return query;}}}));
vi.mock("@/db/schema",()=>Object.fromEntries(["organizations","programs","sitePublications","sites"].map(name=>[name,new Proxy({name},{get:(t,key)=>String(key)})])));
vi.mock("@tanstack/react-start",()=>({createServerFn:()=>({validator(){return this;},handler:(handler:unknown)=>handler})}));
vi.mock("@tanstack/react-start/server",()=>({setResponseHeader:vi.fn()}));
vi.mock("@/modules/identity/actors.server",()=>({requireActor:state.requireActor}));
vi.mock("@/modules/sites/academic-program-catalog.server",()=>({readAcademicProgramCatalog:state.catalog}));
vi.mock("@/modules/sites/site-local-content.server",()=>({readCurrentLocalContent:state.local}));
vi.mock("@/modules/activities/enrichment-catalog.server",()=>({readEnrichmentCatalog:async()=>[]}));
import {getLaunchWebsitePreparation} from "../../src/modules/programs/launch-website.functions";
const school={programId:"program",programName:"Hope School",organizationId:"org",siteId:"site",siteOrganizationId:"org",siteName:"Hope Church",organizationName:"Church",type:"church_hosted_academy",gradeRange:{min:"K",max:"8"},deliveryModel:{onsite:true,onsiteDaysPerWeek:5},metadata:{targetOpeningDate:"2027-08-23"}};
beforeEach(()=>{vi.clearAllMocks();state.actor={scope:{programIds:["program"],siteIds:["site"],organizationIds:["org"]}};state.requireActor.mockImplementation(async()=>state.actor);state.rows=[[school],[{slug:"hope-school",status:"draft"}]];state.catalog.mockResolvedValue([]);state.local.mockResolvedValue(null);});
describe("launch website preparation",()=>{
 it("builds a useful private school draft from saved identity and offered grades",async()=>{
  const view=await getLaunchWebsitePreparation({data:{programId:"program"}});
  expect(view).toMatchObject({programId:"program",siteId:"site",status:"draft",includesSuggestions:true});
  expect(view.previewHtml).toContain("Hope School");expect(view.previewHtml).toContain("Hope Church");
  expect(view.previewHtml).toContain("2027-08-23");expect(view.previewHtml).toContain("K–8");
  expect(view.previewHtml).not.toContain('<form action="/apply"');expect(view.previewHtml).not.toContain('<form action="/inquiry"');
 });
 it("does not create a second planning card for an approved listing",async()=>{
  state.catalog.mockResolvedValue([{programId:"program",title:"Approved School",summary:"Approved school summary",typeLabel:"School",grades:{min:"K",max:"8"},delivery:{onsite:true,asynchronous:false,liveOnline:false,onsiteDaysPerWeek:5},availability:"operating"}]);
  const view=await getLaunchWebsitePreparation({data:{programId:"program"}});
  expect(view.previewHtml).toContain("Approved School");expect(view.previewHtml).not.toContain("This is a planning preview");
  expect(view.previewHtml).not.toContain('<form action="/apply"');
 });
 it("fails closed for another Site before reading any website content",async()=>{
  state.actor.scope.siteIds=["other"];
  await expect(getLaunchWebsitePreparation({data:{programId:"program"}})).rejects.toThrow("launch website scope");
  expect(state.catalog).not.toHaveBeenCalled();expect(state.local).not.toHaveBeenCalled();
 });
 it("denies an unrelated Program even within the same Site",async()=>{
  state.actor.scope.programIds=[];
  await expect(getLaunchWebsitePreparation({data:{programId:"program"}})).rejects.toThrow("launch website scope");
  expect(state.catalog).not.toHaveBeenCalled();
 });
 it("returns an actionable missing reservation instead of inventing a website address",async()=>{
  state.rows=[[school],[]];
  expect(await getLaunchWebsitePreparation({data:{programId:"program"}})).toMatchObject({host:null,previewHtml:null});
  expect(state.catalog).not.toHaveBeenCalled();
 });
});
