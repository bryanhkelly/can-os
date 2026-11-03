import { beforeEach, describe, expect, it, vi } from "vitest";
import { readApprovedPublicParentExtras } from "@/modules/sites/public-parent-extras.server";
import { readApprovedPublicSchoolDay } from "@/modules/academic-time/public-school-day.server";
import { readAcademicProgramCatalog } from "@/modules/sites/academic-program-catalog.server";
import { resolvePublishedFamilyStartDestination } from "@/modules/enrollment/public-family-start.server";

const state=vi.hoisted(()=>({
  metadata:null as Record<string,unknown>|null,
  published:true,
  programs:[] as Array<{
    programId:string;title:string;grades:{min:string;max:string};
    summary:string;typeLabel:string;availability:"planned"|"operating";
    delivery:{onsite:boolean;asynchronous:boolean;liveOnline:boolean;onsiteDaysPerWeek:number|null};
  }>,
}));

vi.mock("@/db/client",()=>({
  db:{select:()=>({
    from(){return this},innerJoin(){return this},where(){return this},
    for(){return this},
    limit(){return Promise.resolve([
      state.published ? {address:null,metadata:state.metadata,
        slug:"oakwood",organizationId:"organization-a"} :
        {address:null,metadata:state.metadata},
    ])},
  })},
}));
vi.mock("@/modules/sites/academic-program-catalog.server",()=>({
  readAcademicProgramCatalog:vi.fn(async ()=>state.programs),
}));
vi.mock("@/modules/sites/site-public-people.server",()=>({
  readApprovedPublicSitePeople:vi.fn(async()=>[]),
}));
vi.mock("@/modules/identity/demo-school-tenants.server",()=>({
  isDemoTenantOrganization:vi.fn(async()=>false),
}));
vi.mock("@/modules/enrollment/public-family-start.server",()=>({
  resolvePublishedFamilyStartDestination:vi.fn(),
}));
vi.mock("@/modules/academic-time/public-school-day.server",()=>({
  readApprovedPublicSchoolDay:vi.fn(),
}));

const siteId="00000000-0000-4000-8000-000000000001";
const program=(programId:string,title:string,grades={min:"K",max:"5"})=>({
  programId,title,summary:"Institutionally approved academic description",
  typeLabel:"Academy",grades,
  availability:"planned" as const,
  delivery:{onsite:true,asynchronous:false,liveOnline:false,onsiteDaysPerWeek:2},
});
const claim=<T,>(value:T)=>({value,source:"calendar",revision:2,
  audience:"public",status:"verified",canDisplay:true});
const pending=()=>({
  state:"pending",timezone:null,weeklyPatternState:"pending",weeklyPattern:[],
  days:{...claim<number[]|null>(null),canDisplay:false,status:"not_configured"},
  startTime:{...claim<string|null>(null),canDisplay:false,status:"not_configured"},
  endTime:{...claim<string|null>(null),canDisplay:false,status:"not_configured"},
  mode:{...claim<string|null>(null),canDisplay:false,status:"not_configured"},
});
const reviewed=(programId:string,days:number[],start="09:00",end="13:00")=>({
  state:"approved",timezone:"America/Los_Angeles",
  days:claim(days),startTime:claim(start),endTime:claim(end),
  mode:{...claim<string|null>(null),canDisplay:false,status:"not_configured"},
  weeklyPatternState:"approved",
  weeklyPattern:days.map(dayOfWeek=>({
    dayOfWeek,startsAtLocal:start,endsAtLocal:end,timezone:"America/Los_Angeles",
  })),
  programScope:{siteId,programId,gradeRange:{min:"K",max:"5"},programType:"full_school"},
});

const metadata={
  familyServices:{
    version:1,revision:3,
    reviewedByPersonId:"00000000-0000-4000-8000-000000000002",
    reviewedAt:"2026-11-02T10:00:00.000Z",
    entries:[{category:"meals",status:"available",
      description:"Lunch available for enrolled students.",
      evidenceReference:"Independent meal contract review",expiresOn:null}],
  },
};

describe("canonical Site parent extras",()=>{
  beforeEach(()=>{
    vi.clearAllMocks();
    state.metadata=metadata;
    state.published=true;
    state.programs=[program("program-one","Early Years")];
    vi.mocked(readApprovedPublicSchoolDay).mockResolvedValue(
      reviewed("program-one",[0,3]) as never);
    vi.mocked(resolvePublishedFamilyStartDestination).mockRejectedValue(
      new Error("School applications not open"));
  });

  it("keeps a reviewed single Program's Sunday schedule and reviewed Site services",async()=>{
    const result=await readApprovedPublicParentExtras(siteId,["program-one"],metadata);
    expect(readApprovedPublicSchoolDay).toHaveBeenCalledWith(
      siteId,"program-one",expect.anything());
    expect(result.schoolDay?.days.value).toEqual([0,3]);
    expect(result.programSchedules).toHaveLength(1);
    expect(result.programSchedules[0]?.weeklyPattern.value?.[0]?.dayOfWeek).toBe(0);
    expect(result.services.find(item=>item.category==="meals")?.description.value)
      .toContain("Lunch available");
  });

  it("preserves distinct academic schedules but never flattens two Programs",async()=>{
    state.programs=[program("program-one","Early Years"),program("program-two","Later Years")];
    vi.mocked(readApprovedPublicSchoolDay).mockImplementation(async (_site,id)=>(
      id==="program-one"
        ? reviewed("program-one",[0,3])
        : reviewed("program-two",[2],"08:30","16:00")
    ) as never);
    const result=await readApprovedPublicParentExtras(
      siteId,["program-one","program-two"],metadata);
    expect(result.schoolDay).toBeUndefined();
    expect(result.programSchedules.map(item=>item.programId))
      .toEqual(["program-one","program-two"]);
    expect(result.programSchedules[1]?.weeklyPattern.value?.[0]?.endsAtLocal)
      .toBe("16:00");
    expect(readApprovedPublicSchoolDay).toHaveBeenCalledTimes(2);
  });

  it("withholds unapproved/mismatched schedule and never reads unpublished Program",async()=>{
    vi.mocked(readApprovedPublicSchoolDay).mockResolvedValue({
      ...reviewed("other-program",[0]),programScope:{
        ...reviewed("other-program",[0]).programScope,programId:"other-program",
      },
    } as never);
    const result=await readApprovedPublicParentExtras(
      siteId,["program-one","unpublished-program"],metadata);
    expect(result.programSchedules).toHaveLength(0);
    expect(readApprovedPublicSchoolDay).toHaveBeenCalledTimes(1);
    expect(state.programs).toHaveLength(1);
    expect(readAcademicProgramCatalog).toHaveBeenCalledWith(siteId,expect.anything());
  });

  it("distinguishes planned inquiries from independently verified applications",async()=>{
    const closed=await readApprovedPublicParentExtras(siteId,["program-one"],metadata);
    expect(closed.admissions.applicationOpen).toBe(false);
    expect(closed.admissions.programs?.[0]?.status).toBe("preopening_inquiry");
    vi.mocked(resolvePublishedFamilyStartDestination).mockResolvedValue({
      siteId,organizationId:"organization-a",programId:"program-one",
      programName:"Early Years",slug:"oakwood",
    });
    const open=await readApprovedPublicParentExtras(siteId,["program-one"],metadata);
    expect(open.admissions.applicationOpen).toBe(true);
    expect(open.admissions.programs?.[0]?.status).toBe("verified_application");
    expect(open.admissions.programs?.[0]?.informationSessionInterestAvailable).toBe(false);
  });

  it("never publishes family services without current institution review",async()=>{
    state.metadata=null;
    state.programs=[];
    const result=await readApprovedPublicParentExtras(siteId,[],null);
    expect(result.schoolDay).toBeUndefined();
    expect(result.programSchedules).toEqual([]);
    expect(result.services.every(item=>!item.description.canDisplay)).toBe(true);
  });
});
