import { describe, expect, it } from "vitest";
import { readEnrichmentPackages, selectEnrichmentPackages,
  sessionOccupancy, selectedSessionWaitlisted, verifyEnrichmentPackages } from "@/domain/enrichment-packages";

const a="00000000-0000-4000-8000-000000000001";
const b="00000000-0000-4000-8000-000000000002";
const c="00000000-0000-4000-8000-000000000003";
const w1="00000000-0000-4000-8000-000000000011";
const w2="00000000-0000-4000-8000-000000000012";
const full="00000000-0000-4000-8000-000000000013";
const pkgs=[
 {id:w1,title:"Week 1",priceCents:10000,sessionIds:[a,b]},
 {id:w2,title:"Week 2",priceCents:15000,sessionIds:[c]},
 {id:full,title:"Full camp",priceCents:23000,sessionIds:[a,b,c]},
];
describe("enrichment per-session packages",()=>{
 it("validates real events and exact unique ids",()=>{
   expect(verifyEnrichmentPackages(pkgs,[a,b,c])).toEqual(pkgs);
   expect(()=>verifyEnrichmentPackages([{...pkgs[0],sessionIds:[a,a]}],[a])).toThrow(/unique/);
   expect(()=>verifyEnrichmentPackages([{...pkgs[0],sessionIds:[b]}],[a])).toThrow(/scheduled/);
   expect(()=>verifyEnrichmentPackages([pkgs[0],pkgs[0]],[a,b])).toThrow(/IDs must be unique/);
   expect(readEnrichmentPackages({enrichmentPackages:pkgs})).toEqual(pkgs);
   expect(()=>readEnrichmentPackages({enrichmentPackages:[{id:"bad"}]})).toThrow();
 });
 it("can purchase two weeks together, but not overlapping options",()=>{
   expect(selectEnrichmentPackages(pkgs,[w2,w1],{sessionIds:[],amountCents:0}))
      .toEqual({packageIds:[w1,w2],sessionIds:[a,b,c],amountCents:25000});
   expect(()=>selectEnrichmentPackages(pkgs,[w1,full],{sessionIds:[],amountCents:0})).toThrow(/overlapping/);
   expect(()=>selectEnrichmentPackages(pkgs,[w1,w1],{sessionIds:[],amountCents:0})).toThrow(/unique/);
   expect(()=>selectEnrichmentPackages(pkgs,[],{sessionIds:[],amountCents:0})).toThrow(/Choose/);
 });
 it("checks the days booked, not the number of season registrations",()=>{
   const bookings=[
     {status:"pending",metadata:{enrichmentSelection:{sessionIds:[a,b]}}},
     {status:"eligible",metadata:{enrichmentSelection:{sessionIds:[a]}}},
     {status:"waitlisted",metadata:{enrichmentSelection:{sessionIds:[a]}}},
   ];
   const used=sessionOccupancy([a,b,c],bookings);
   expect([...used.entries()]).toEqual([[a,2],[b,1],[c,0]]);
   expect(selectedSessionWaitlisted([c],used,2)).toBe(false);
   expect(selectedSessionWaitlisted([a,c],used,2)).toBe(true);
   expect(sessionOccupancy([a,b], [{status:"pending",metadata:{}}]).get(b)).toBe(1);
 });
 it("allows legacy full-season registration only without packages",()=>{
   expect(selectEnrichmentPackages([],undefined,{sessionIds:[b,a],amountCents:5000}))
     .toEqual({packageIds:[],sessionIds:[a,b],amountCents:5000});
   expect(()=>selectEnrichmentPackages([], [w1],{sessionIds:[a],amountCents:0})).toThrow(/does not offer/);
 });
});
