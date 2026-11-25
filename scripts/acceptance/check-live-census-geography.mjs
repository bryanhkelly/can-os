// Explicit on-demand acceptance only. No tenant addresses or DB writes.
import assert from "node:assert/strict";
import {createCensusGeographyProvider} from "../../src/modules/geography/census-geography-provider.server.ts";
const provider=createCensusGeographyProvider({apiKey:process.env.CENSUS_DATA_API_KEY});
const fixtures=[
 {address:{country:"US",state:"DC",postalCode:"20500",city:"Washington",street1:"1600 Pennsylvania Avenue NW"},market:"US-CBSA-47900"},
 {address:{country:"US",state:"GA",postalCode:"30303",city:"Atlanta",street1:"101 Marietta Street NW"},market:"US-CBSA-12060"},
];
try{
 for(const {address,market} of fixtures){
  const result=await provider.resolve(address);
  assert.ok(result,"Public landmark must resolve");
  assert.equal(result.vintage,"424");
  assert.equal(result.marketStatus,"metro");
  const area=result.areas.find(a=>a.code===market);
  assert.ok(area,"Expected pinned metropolitan area");
  if(process.env.CENSUS_DATA_API_KEY){
   const profile=await provider.communityProfile(area,2024);
   assert.ok(profile&&profile.indicators.population.estimate>0&&profile.indicators.population.marginOfError!==null,"Expected ACS estimate and uncertainty");
  }
 }
 console.log("Public landmark geocoding acceptance passed");
 if(!process.env.CENSUS_DATA_API_KEY){console.error("ACS acceptance blocked: CENSUS_DATA_API_KEY is missing");process.exitCode=2;}
 else console.log("ACS profile acceptance passed");
}catch{
 console.error("Live Census acceptance failed; provider details and credentials suppressed");
 process.exitCode=1;
}
