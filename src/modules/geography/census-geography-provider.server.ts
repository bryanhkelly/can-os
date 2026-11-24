import type { PhysicalSiteAddress } from "@/domain/site-setup-configuration";
import {censusEstimate,communityIndicators,type CommunityProfile,type GeographicAreaFact,type GeographicResolution,type GeographyKind} from "@/domain/geographic-intelligence";

export interface GeographyProvider {
  resolve(address:PhysicalSiteAddress):Promise<GeographicResolution|null>;
  communityProfile(area:GeographicAreaFact,year:number):Promise<CommunityProfile|null>;
}
type Row=Record<string,unknown>;
const object=(value:unknown):Row=>value!==null&&typeof value==="object"&&!Array.isArray(value)?value as Row:{};
const string=(value:unknown)=>typeof value==="string"?value:"";
const layers:readonly [string,GeographyKind,string,RegExp][]=[
  ["Counties","county","COUNTY",/^\d{5}$/],
  ["Census Tracts","tract","TRACT",/^\d{11}$/],
  ["Metropolitan Statistical Areas","metro","CBSA",/^\d{5}$/],
  ["Micropolitan Statistical Areas","micro","CBSA",/^\d{5}$/],
  ["Combined Statistical Areas","csa","CSA",/^\d{3}$/],
  ["Incorporated Places","place","PLACE",/^\d{7}$/],
  ["Census Designated Places","place","PLACE",/^\d{7}$/],
  ["Unified School Districts","school_district","UNSD",/^\d{7}$/],
  ["Elementary School Districts","school_district","ELSD",/^\d{7}$/],
  ["Secondary School Districts","school_district","SCSD",/^\d{7}$/],
  ["Urban Areas","urban_area","UA",/^\d{5}$/],
];
const regions:Record<string,readonly string[]>={
  Northeast:["CT","ME","MA","NH","RI","VT","NJ","NY","PA"],
  Midwest:["IL","IN","MI","OH","WI","IA","KS","MN","MO","NE","ND","SD"],
  South:["DE","FL","GA","MD","NC","SC","VA","DC","WV","AL","KY","MS","TN","AR","LA","OK","TX"],
  West:["AZ","CO","ID","MT","NV","NM","UT","WY","AK","CA","HI","OR","WA"],
};
export function parseCensusGeography(raw:unknown,address:PhysicalSiteAddress):GeographicResolution|null {
  const result=object(object(raw).result), matches=result.addressMatches;
  if(!Array.isArray(matches))throw new Error("geography_provider_invalid_response");
  if(matches.length!==1)return null;
  const match=object(matches[0]),coords=object(match.coordinates),geo=object(match.geographies);
  const components=object(match.addressComponents);
  const latitude=coords.y,longitude=coords.x;
  if(typeof latitude!=="number"||typeof longitude!=="number"||!Number.isFinite(latitude)||!Number.isFinite(longitude)||
    Math.abs(latitude)>90||Math.abs(longitude)>180||components.state!==address.state||
    components.zip!==address.postalCode.slice(0,5))return null;
  const input=object(result.input),benchmark=string(object(input.benchmark).id)||String(object(input.benchmark).id??""),
    vintage=string(object(input.vintage).id)||String(object(input.vintage).id??"");
  if(!benchmark||!vintage)throw new Error("geography_provider_missing_version");
  const areas:GeographicAreaFact[]=[{code:"US",name:"United States",kind:"country",sourceId:"US"}];
  const add=(kind:GeographyKind,prefix:string,id:string,name:string)=>{
    if(name&&!areas.some(a=>a.code==="US-"+prefix+"-"+id))areas.push({code:"US-"+prefix+"-"+id,name,kind,sourceId:id});
  };
  const state=Array.isArray(geo.States)?object(geo.States[0]):{};
  if(/^\d{2}$/.test(string(state.GEOID)))areas.push({code:"US-"+address.state,name:string(state.NAME)||address.state,kind:"state",sourceId:string(state.GEOID)});
  const region=Object.entries(regions).find(([,states])=>states.includes(address.state))?.[0];
  if(region)add("region","REGION",region.toUpperCase(),region);
  for(const [layer,kind,prefix,pattern] of layers){
    const rows=geo[layer];if(!Array.isArray(rows))continue;
    for(const row of rows){const item=object(row),id=string(item.GEOID);if(pattern.test(id))add(kind,prefix,id,string(item.NAME));}
  }
  for(const [layer,rows] of Object.entries(geo)){
    const type=/Congressional Districts$/.test(layer)?["congressional_district","CD"] as const:
      /State Legislative Districts.*Upper/i.test(layer)?["state_legislative_upper","SLDU"] as const:
      /State Legislative Districts.*Lower/i.test(layer)?["state_legislative_lower","SLDL"] as const:null;
    if(!type||!Array.isArray(rows))continue;
    for(const row of rows){const item=object(row),id=string(item.GEOID);if(/^[0-9A-Z]{4,6}$/.test(id))add(type[0],type[1],id,string(item.NAME));}
  }
  if(!areas.some(a=>a.kind==="county"))return null;
  const markets=areas.filter(a=>a.kind==="metro"||a.kind==="micro");
  if(markets.length>1)throw new Error("geography_provider_ambiguous_market");
  // An omitted layer is not evidence that a point lies outside a market.
  const complete=Array.isArray(geo["Metropolitan Statistical Areas"])&&Array.isArray(geo["Micropolitan Statistical Areas"]);
  return {source:"us-census-geocoder",benchmark,vintage,latitude,longitude,areas,
    marketStatus:markets[0]?.kind==="metro"?"metro":markets[0]?.kind==="micro"?"micro":complete?"outside_market":"unknown"};
}
export function parseCommunityProfile(raw:unknown,area:GeographicAreaFact,year:number):CommunityProfile|null {
  if(!Array.isArray(raw)||raw.length!==2||!Array.isArray(raw[0])||!Array.isArray(raw[1]))return null;
  const header=raw[0],values=raw[1];
  const value=(key:string)=>values[header.indexOf(key)];
  if(area.kind==="county"&&(String(value("state"))+String(value("county"))!==area.sourceId))return null;
  if((area.kind==="metro"||area.kind==="micro")&&value("metropolitan statistical area/micropolitan statistical area")!==area.sourceId)return null;
  const indicators=Object.fromEntries(Object.entries(communityIndicators).map(([name,variable])=>[name,{
    variable,estimate:censusEstimate(value(variable+"E")),marginOfError:censusEstimate(value(variable+"M")),
  }])) as CommunityProfile["indicators"];
  return {areaCode:area.code,source:"acs5",year,indicators};
}
export function createCensusGeographyProvider(options:{fetcher?:typeof fetch;apiKey?:string}={}):GeographyProvider {
  const fetcher=options.fetcher??fetch;
  async function json(url:URL){
    const response=await fetcher(url,{signal:AbortSignal.timeout(12000)});
    if(!response.ok)throw new Error("geography_provider_unavailable");
    return response.json() as Promise<unknown>;
  }
  return {
    async resolve(address){
      if(address.country!=="US"||/^\s*(?:p\.?\s*o\.?\s*box|post office box)\b/i.test(address.street1))return null;
      const url=new URL("https://geocoding.geo.census.gov/geocoder/geographies/address");
      url.search=new URLSearchParams({street:address.street1,city:address.city,state:address.state,zip:address.postalCode.slice(0,5),
        benchmark:"Public_AR_Current",vintage:"ACS2024_Current",layers:"all",format:"json"}).toString();
      return parseCensusGeography(await json(url),address);
    },
    async communityProfile(area,year){
      if(!options.apiKey)return null;
      if(!Number.isInteger(year)||year<2020||year>2100)throw new Error("invalid_acs_year");
      const url=new URL("https://api.census.gov/data/"+year+"/acs/acs5");
      url.searchParams.set("get",["NAME",...Object.values(communityIndicators).flatMap(v=>[v+"E",v+"M"])].join(","));
      if(area.kind==="county"&&/^\d{5}$/.test(area.sourceId)){
        url.searchParams.set("for","county:"+area.sourceId.slice(2));url.searchParams.set("in","state:"+area.sourceId.slice(0,2));
      }else if((area.kind==="metro"||area.kind==="micro")&&/^\d{5}$/.test(area.sourceId)){
        url.searchParams.set("for","metropolitan statistical area/micropolitan statistical area:"+area.sourceId);
      }else return null;
      url.searchParams.set("key",options.apiKey);
      return parseCommunityProfile(await json(url),area,year);
    },
  };
}
