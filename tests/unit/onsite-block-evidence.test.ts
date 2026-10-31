import {describe,expect,it,vi} from "vitest";

// Evidence policy is pure. No Neon connection or database fixtures should
// be required for these fail-closed boundary cases.
vi.mock("@/db/client",()=>({db:{}}));
import {parseVerifiedRoomPlan} from "@/modules/operations/onsite-block-room-plan.server";
import {verifiedAdultCoversBlock} from "@/modules/operations/onsite-block-safety.server";

const scope={
  date:"2026-10-23",siteId:"site-1",programId:"program-1",
  sectionId:"section-1",periodId:"period-1",
  timeZone:"America/Chicago",startsAtLocal:"09:00",endsAtLocal:"10:00",
};
const doc=()=>({
  id:"document-1",subjectType:"section",subjectId:scope.sectionId,
  category:"onsite_block_room_coverage_plan",
  uploadedByPersonId:"host-director",
  verifiedByPersonId:"can-independent-reviewer",
  verifiedAt:new Date("2026-10-22T12:00:00Z"),
  expiresAt:new Date("2026-10-24T12:00:00Z"),
  metadata:{
    ...scope,primaryPersonId:"primary-person",backupPersonId:"backup-person",
    roomLabel:"Sanctuary Classroom",roomCapacity:24,
  },
});

describe("school-day review evidence is not a user checkbox",()=>{
  it("accepts only a precisely scoped and independently reviewed room plan",()=>{
    expect(parseVerifiedRoomPlan(doc(),scope)).toMatchObject({
      sectionId:"section-1",periodId:"period-1",
      primaryPersonId:"primary-person",backupPersonId:"backup-person",
      roomLabel:"Sanctuary Classroom",roomCapacity:24,
    });
    expect(parseVerifiedRoomPlan({...doc(),verifiedByPersonId:"host-director"},scope)).toBeNull();
    expect(parseVerifiedRoomPlan({...doc(),verifiedAt:null},scope)).toBeNull();
    expect(parseVerifiedRoomPlan({...doc(),expiresAt:new Date("2026-10-23T13:30:00Z")},scope)).toBeNull();
    expect(parseVerifiedRoomPlan({
      ...doc(),metadata:{...doc().metadata,periodId:"another-period"},
    },scope)).toBeNull();
    expect(parseVerifiedRoomPlan({
      ...doc(),metadata:{...doc().metadata,backupPersonId:"primary-person"},
    },scope)).toBeNull();
    expect(parseVerifiedRoomPlan({
      ...doc(),metadata:{...doc().metadata,roomCapacity:0},
    },scope)).toBeNull();
  });

  it("rejects superseded, rejected and changed-schedule plans",()=>{
    for(const metadata of [
      {...doc().metadata,isCurrent:false},
      {...doc().metadata,reviewStatus:"pending"},
      {...doc().metadata,reviewStatus:"rejected"},
      {...doc().metadata,startsAtLocal:"08:00"},
      {...doc().metadata,endsAtLocal:"11:00"},
    ])expect(parseVerifiedRoomPlan({...doc(),metadata},scope)).toBeNull();
  });

  it("screens primary and backup evidence for the entire scheduled local block",()=>{
    const complete={
      screening:[{from:new Date("2026-10-22T14:00:00Z"),
        through:new Date("2026-10-24T14:00:00Z")}],
      training:[{from:new Date("2026-10-21T14:00:00Z"),
        through:new Date("2026-10-25T14:00:00Z")}],
    };
    expect(verifiedAdultCoversBlock(complete,scope))
      .toEqual({screening:true,training:true});
    expect(verifiedAdultCoversBlock({
      ...complete,screening:[{
        from:new Date("2026-10-22T14:00:00Z"),
        through:new Date("2026-10-23T14:30:00Z"),
      }],
    },scope)).toEqual({screening:false,training:true});
    expect(verifiedAdultCoversBlock(undefined,scope))
      .toEqual({screening:false,training:false});
  });
});
