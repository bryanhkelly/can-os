import {describe,expect,it,vi} from "vitest";
import {parseCensusGeography,createCensusGeographyProvider,parseCommunityProfile,parseTigerMarket} from "@/modules/geography/census-geography-provider.server";
import {censusEstimate,marketArea,communityArea} from "@/domain/geographic-intelligence";
const address={country:"US",state:"GA",postalCode:"30060",city:"Marietta",street1:"100 Example Street"};
const payload=(geographies:Record<string,unknown>)=>({result:{input:{benchmark:{id:"4"},vintage:{id:"424"}},addressMatches:[{
  coordinates:{x:-84.5,y:33.9},addressComponents:{state:"GA",zip:"30060"},geographies:{States:[{GEOID:"13",NAME:"Georgia"}],Counties:[{GEOID:"13067",NAME:"Cobb County"}],...geographies}
}]}});
describe("Geographic intelligence",()=>{
 it("preserves state authority and derives a separate market",()=>{
  const result=parseCensusGeography(payload({"Metropolitan Statistical Areas":[{GEOID:"12060",NAME:"Atlanta-Sandy Springs-Roswell, GA"}]}),address)!;
  expect(result.marketStatus).toBe("metro");expect(marketArea(result)?.code).toBe("US-CBSA-12060");
  expect(result.areas.map(a=>a.code)).toContain("US-GA");
 });
 it("does not infer rural or an adjacent market from omitted layers",()=>{
  const result=parseCensusGeography(payload({}),address)!;
  expect(result.marketStatus).toBe("unknown");expect(communityArea(result)?.code).toBe("US-COUNTY-13067");
  expect(parseCensusGeography(payload({"Metropolitan Statistical Areas":[],"Micropolitan Statistical Areas":[]}),address)?.marketStatus).toBe("outside_market");
 });
 it("rejects mismatched address and ambiguous matches",()=>{
  expect(parseCensusGeography(payload({}),{...address,postalCode:"99999"})).toBeNull();
  expect(parseCensusGeography({result:{addressMatches:[{},{}]}},address)).toBeNull();
 });
 it("keeps suppressed estimates null and margins of error separate",()=>{
  const area={kind:"county" as const,code:"US-COUNTY-13067",sourceId:"13067",name:"Cobb County"};
  const profile=parseCommunityProfile([["state","county","B01003_001E","B01003_001M"],["13","067","100","5"]],area,2024);
  expect(profile?.indicators.population).toEqual({variable:"B01003_001",estimate:100,marginOfError:5});
  expect(profile?.indicators.medianHouseholdIncome.estimate).toBeNull();expect(censusEstimate("-666666666")).toBeNull();
 });
 it("uses pinned market boundaries when empty layers are omitted",async()=>{
  const fetcher=vi.fn<typeof fetch>()
   .mockResolvedValueOnce(new Response(JSON.stringify(payload({}))))
   .mockResolvedValueOnce(new Response(JSON.stringify({features:[{attributes:{GEOID:"12060",NAME:"Atlanta Metro"}}]})))
   .mockResolvedValueOnce(new Response(JSON.stringify({features:[]})));
  const result=await createCensusGeographyProvider({fetcher}).resolve(address);
  expect(result?.marketStatus).toBe("metro");
  expect(result?.areas.find(a=>a.kind==="metro")?.code).toBe("US-CBSA-12060");
  expect(String(fetcher.mock.calls[1]?.[0])).toContain("tigerWMS_ACS2024/MapServer/93/query");
  expect(String(fetcher.mock.calls[2]?.[0])).toContain("tigerWMS_ACS2024/MapServer/91/query");
 });
 it("requires two successful empty boundary responses for outside-market classification",async()=>{
  const fetcher=vi.fn<typeof fetch>()
   .mockResolvedValueOnce(new Response(JSON.stringify(payload({}))))
   .mockResolvedValueOnce(new Response(JSON.stringify({features:[]})))
   .mockResolvedValueOnce(new Response(JSON.stringify({features:[]})));
  expect((await createCensusGeographyProvider({fetcher}).resolve(address))?.marketStatus).toBe("outside_market");
  expect(()=>parseTigerMarket({error:{code:500}},"metro")).toThrow();
  expect(()=>parseTigerMarket({features:[{attributes:{GEOID:"bad",NAME:"Unknown"}}]},"metro")).toThrow();
  expect(parseCensusGeography(payload({"Metropolitan Statistical Areas":[{}],"Micropolitan Statistical Areas":[]}),address)?.marketStatus).toBe("unknown");
 });
 it("does not send PO boxes or call ACS without a configured key",async()=>{
  const fetcher=vi.fn<typeof fetch>();const provider=createCensusGeographyProvider({fetcher});
  expect(await provider.resolve({...address,street1:"P.O. Box 123"})).toBeNull();
  expect(await provider.communityProfile({kind:"county",code:"US-COUNTY-13067",sourceId:"13067",name:"Cobb County"},2024)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
 });
});

describe("Census provider transport",()=>{
 it("rejects redirects and keeps the request timeout",async()=>{
  const fetcher=vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(payload({"Metropolitan Statistical Areas":[],"Micropolitan Statistical Areas":[]}))));
  await createCensusGeographyProvider({fetcher}).resolve(address);
  expect(fetcher).toHaveBeenCalledWith(expect.any(URL),expect.objectContaining({redirect:"error",signal:expect.any(AbortSignal)}));
 });
 it("rejects oversized streamed and declared provider responses",async()=>{
  const oversized=new Uint8Array(1024*1024+1);
  const stream=new ReadableStream<Uint8Array>({start(controller){controller.enqueue(oversized);controller.close();}});
  const fetcher=vi.fn<typeof fetch>()
   .mockResolvedValueOnce(new Response(stream))
   .mockResolvedValueOnce(new Response("{}",{headers:{"content-length":"1048577"}}))
   .mockResolvedValueOnce(new Response(new Uint8Array([0xff])));
  const provider=createCensusGeographyProvider({fetcher});
  for(let i=0;i<3;i++)await expect(provider.resolve(address)).rejects.toThrow("geography_provider_invalid_response");
 });
});
