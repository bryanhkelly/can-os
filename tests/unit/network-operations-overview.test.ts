import {describe,it,expect} from "vitest";
import {summarizeNetworkOperations} from "@/domain/network-operations-overview";
describe("network executive operating measures",()=>{
  it("renders genuine zero counts with an empty authorized workspace",()=>{
    expect(summarizeNetworkOperations([],[])).toEqual({ownedSites:0,approvedSites:0,pendingRequests:0,affiliatedOrganizations:0});
  });
  it("deduplicates Sites and organizations without counting rejected or revoked affiliations",()=>{
    const a=(id:string,siteId:string,siteOrganizationId:string,status:string)=>({id,siteId,siteOrganizationId,status});
    expect(summarizeNetworkOperations([{id:"s1"},{id:"s1"}],[
      a("a1","s2","o1","approved"),a("a2","s3","o1","approved"),a("a2","s3","o1","approved"),
      a("a3","s4","o2","pending"),a("a4","s5","o3","revoked"),a("a5","s6","o4","rejected"),
    ])).toEqual({ownedSites:1,approvedSites:2,pendingRequests:1,affiliatedOrganizations:1});
  });
});
