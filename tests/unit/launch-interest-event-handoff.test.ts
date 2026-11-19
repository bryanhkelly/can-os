import { beforeEach, describe, expect, it, vi } from "vitest";

const calls=vi.hoisted(()=>({
  listEvents:vi.fn(),
  listPackages:vi.fn(),
  readSuggestions:vi.fn(),
}));
vi.mock("@tanstack/react-router",()=>({
  createFileRoute:()=> (options:unknown)=>({options}),
}));
vi.mock("@/routes/operations.interest-events",()=>({
  InterestEventsWorkspace:()=>null,
}));
vi.mock("@/modules/enrollment/interest-events.functions",()=>({
  listSchoolInterestEvents:calls.listEvents,
}));
vi.mock("@/modules/programs/site-marketing-packages-v61.functions",()=>({
  listSiteMarketingPackagesV61:calls.listPackages,
  readSiteMarketingSuggestionsV61:calls.readSuggestions,
}));

import { Route } from "@/routes/operations.interest-events_.new";

const siteA="11111111-1111-4111-8111-111111111111";
const siteB="22222222-2222-4222-8222-222222222222";
const programA="33333333-3333-4333-8333-333333333333";
const programB="44444444-4444-4444-8444-444444444444";
const packageId="55555555-5555-4555-8555-555555555555";
const data={
  programs:[
    {id:programA,siteId:siteA,name:"Site A Program",timezone:"America/Los_Angeles"},
    {id:programB,siteId:siteB,name:"Site B Program",timezone:"America/New_York"},
  ],
  events:[],
};
const eventPackage=(siteId:string,status="draft",purpose="event-invitation")=>({
  id:packageId,siteId,status,content:{
    purpose,headline:"Community learning open house",message:"Meet our neighbors.",
  },
});

type Outcome = {
  ok:boolean;data?:{data:typeof data;suggestedTitle:string|null;source:string|null};
};
const load=async(deps:{siteId?:string;programId?:string;packageId?:string})=>{
  const route=Route as unknown as {
    options:{loader:(args:{deps:typeof deps})=>Promise<Outcome>};
  };
  return route.options.loader({deps});
};

beforeEach(()=>{
  vi.clearAllMocks();
  calls.listEvents.mockResolvedValue(data);
  calls.listPackages.mockResolvedValue([eventPackage(siteA)]);
  calls.readSuggestions.mockResolvedValue({
    "event-invitation":{content:{headline:"Saved Story conversation"}},
  });
});

describe("Introduce Interest Event handoff uses exact authorized Site and saved package",()=>{
  it("prefills a live Site-owned package without creating or sending an event",async()=>{
    const outcome=await load({siteId:siteA,programId:programA,packageId});
    expect(outcome.ok).toBe(true);
    expect(outcome.data?.suggestedTitle).toBe("Community learning open house");
    expect(outcome.data?.source).toBe("saved-package");
    expect(calls.listPackages).toHaveBeenCalledWith({data:{siteId:siteA}});
    expect(calls.readSuggestions).not.toHaveBeenCalled();
  });

  it("rejects an explicit ungranted Site without returning another Site's programs",async()=>{
    calls.listEvents.mockResolvedValue({...data,programs:[data.programs[0]]});
    const outcome=await load({siteId:siteB,packageId});
    expect(outcome.ok).toBe(false);
    expect(calls.listPackages).not.toHaveBeenCalled();
    expect(calls.readSuggestions).not.toHaveBeenCalled();
  });

  it("rejects a Program from a different Site rather than picking the first",async()=>{
    const outcome=await load({siteId:siteA,programId:programB,packageId});
    expect(outcome.ok).toBe(false);
    expect(calls.listPackages).not.toHaveBeenCalled();
  });

  it("rejects archived and foreign packages instead of silently suggesting unrelated copy",async()=>{
    for(const wrong of [eventPackage(siteA,"archived"),eventPackage(siteB)]){
      calls.listPackages.mockResolvedValue([wrong]);
      const outcome=await load({siteId:siteA,packageId});
      expect(outcome.ok).toBe(false);
      expect(calls.readSuggestions).not.toHaveBeenCalled();
    }
  });

  it("uses the existing Story suggestion only when no package was selected",async()=>{
    const outcome=await load({siteId:siteA});
    expect(outcome.ok).toBe(true);
    expect(outcome.data?.suggestedTitle).toBe("Saved Story conversation");
    expect(outcome.data?.source).toBe("establish");
    expect(calls.listPackages).not.toHaveBeenCalled();
  });

  it("preserves unscoped legacy event entry without auto-selecting an unrelated Site",async()=>{
    const outcome=await load({});
    expect(outcome.ok).toBe(true);
    expect(outcome.data?.suggestedTitle).toBeNull();
    expect(calls.listPackages).not.toHaveBeenCalled();
    expect(calls.readSuggestions).not.toHaveBeenCalled();
  });
});
