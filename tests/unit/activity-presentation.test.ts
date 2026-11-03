import { describe,expect,it } from "vitest";
import {
  activityPresentationCategory,projectPublishedEnrichmentActivity,
} from "@/domain/activity-presentation";

describe("canonical enrichment presentation",()=>{
  it("maps existing and additional activity types without creating another catalog",()=>{
    expect(activityPresentationCategory("athletics")).toBe("athletics");
    expect(activityPresentationCategory("robotics")).toBe("stem");
    expect(activityPresentationCategory("faith")).toBe("faith_service");
    expect(activityPresentationCategory("leadership")).toBe("clubs_leadership");
    expect(activityPresentationCategory("field_trip")).toBe("outings");
  });
  it("removes registration when full or packages are unavailable",()=>{
    const base={
      name:"Soccer club",seasonName:"Summer",startsOn:"2027-06-01",
      endsOn:"2027-07-01",registrationOpen:true,seatsRemaining:2,
    };
    expect(projectPublishedEnrichmentActivity(base).registrationOpen).toBe(true);
    expect(projectPublishedEnrichmentActivity({...base,seatsRemaining:0})
      .registrationOpen).toBe(false);
    expect(projectPublishedEnrichmentActivity({...base,packages:[
      {available:true,seatsRemaining:0},{available:false,seatsRemaining:5},
    ]}).registrationOpen).toBe(false);
    expect(projectPublishedEnrichmentActivity({...base,registrationOpen:false})
      .registrationOpen).toBe(false);
  });
});
