import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  siteSpacePlanningResourcesV61Schema, createSiteSpaceV61Schema,
  saveSiteSpaceV61Schema, saveClassPhysicalPlanV61Schema,
  parseSitePlanningResourcesV61, mergeSitePlanningResourcesV61,
  roomPlanningFitsClass,
} from "@/domain/launch-facilities-v61";

const id="00000000-0000-4000-8000-000000000001";
const other="00000000-0000-4000-8000-000000000002";
const read=(path:string)=>readFileSync(path,"utf8");

describe("V6.1 canonical physical facilities",()=>{
  it("defaults unverified fields to unknown and preserves other Site Space resources",()=>{
    const defaults=siteSpacePlanningResourcesV61Schema.parse({});
    expect(defaults.connectivity.internetAvailable).toBeNull();
    expect(defaults.accessibility.stepFreeAccess).toBeNull();
    expect(defaults.devices).toEqual([]);
    const original={publishedQualificationEvidence:"untouched",siteEquipmentPolicy:{locked:true}};
    const merged=mergeSitePlanningResourcesV61(original,{
      ...defaults,
      connectivity:{...defaults.connectivity,internetAvailable:true,wifiAvailable:true,downloadMbps:50},
      devices:[{category:"Laptop",quantity:12}],
      equipment:["Projector"],
    });
    expect(merged.publishedQualificationEvidence).toBe("untouched");
    expect(merged.siteEquipmentPolicy).toEqual({locked:true});
    expect(parseSitePlanningResourcesV61(merged).devices).toEqual([{category:"Laptop",quantity:12}]);
    expect(parseSitePlanningResourcesV61({})).toEqual(defaults);
  });

  it("rejects malformed, excessive, or ambiguous resource declarations",()=>{
    expect(siteSpacePlanningResourcesV61Schema.safeParse({
      devices:[{category:"Laptop",quantity:1},{category:"laptop",quantity:2}],
    }).success).toBe(false);
    expect(siteSpacePlanningResourcesV61Schema.safeParse({
      equipment:["Camera","camera"],
    }).success).toBe(false);
    expect(siteSpacePlanningResourcesV61Schema.safeParse({
      connectivity:{downloadMbps:-10},
    }).success).toBe(false);
    expect(createSiteSpaceV61Schema.safeParse({
      siteId:id,spaceId:other,name:"Training Room",maxOccupancy:30,
      resources:siteSpacePlanningResourcesV61Schema.parse({}),
    }).success).toBe(true);
    expect(saveSiteSpaceV61Schema.safeParse({
      siteId:id,spaceId:other,name:"Room",maxOccupancy:0,
      resources:siteSpacePlanningResourcesV61Schema.parse({}),
      expectedRevision:1,reason:"Capacity changed",
    }).success).toBe(false);
  });

  it("protects room capacity and verified facilitator linkage contracts",()=>{
    expect(roomPlanningFitsClass(20,30)).toBe(true);
    expect(roomPlanningFitsClass(40,30)).toBe(false);
    expect(roomPlanningFitsClass(10,null)).toBe(false);
    expect(roomPlanningFitsClass(null,30)).toBe(true);
    const base={siteId:id,classId:other,spaceId:id,expectedRevision:1,
      facilitatorAssignmentId:null};
    expect(saveClassPhysicalPlanV61Schema.safeParse(base).success).toBe(true);
    expect(saveClassPhysicalPlanV61Schema.safeParse({
      ...base,spaceId:null,facilitatorAssignmentId:other,
    }).success).toBe(false);
    expect(saveClassPhysicalPlanV61Schema.safeParse({
      ...base,expectedRevision:0,
    }).success).toBe(false);
  });

  it("uses existing canonical entities, no Section or duplicated room-coverage store",()=>{
    const site=read("src/modules/operations/launch-site-facilities.functions.ts");
    const cls=read("src/modules/classes/launch-class-facilities.functions.ts");
    const prepare=read("src/components/launch-studio/PrepareOperationsV61.tsx");
    const migration=read("database/production/2026-11-20-launch-v61-canonical-class-physical-space.sql");
    expect(site).toContain('from "@/db/canonical-v301"');
    expect(site).toContain("saveLaunchSiteSpaceV61");
    expect(site).toContain("assertSiteSetupScope(actor,site,capability)");
    expect(site).toContain("revision:room.revision+1");
    expect(site).toContain("maxOccupancy:data.maxOccupancy");
    expect(cls).toContain("validateClassAuthority(tx");
    expect(cls).toContain("assertCurrentCanonicalStaffForMutation");
    expect(cls).toContain("canonicalClassStaffAssignments");
    expect(cls).toContain("accountPersonGrants");
    expect(cls).toContain("physicalPlanningRevision:revision");
    expect(cls).toContain("roomPlanningFitsClass(cls.capacity,space.maxOccupancy)");
    expect(prepare).toContain("<LaunchSiteFacilitiesWorkspaceV61");
    expect(prepare).toContain("<LaunchClassFacilitiesWorkspaceV61");
    expect(prepare).not.toContain("<RoomCoverageWorkspace");
    expect(migration).toContain("REFERENCES public.site_spaces(id,site_id)");
    expect(migration).toContain("REFERENCES public.class_staff_assignments(id)");
    expect(migration).not.toContain("room_coverage_sections");
    expect(migration).toContain("physical_planning_revision");
  });
});
