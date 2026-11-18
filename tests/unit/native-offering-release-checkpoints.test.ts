import { describe, expect, it } from "vitest";
import {
  projectNativeReleaseCheckpoints, type NativeReleaseCheckpointInput,
} from "@/domain/native-offering-release-checkpoints";

const baseline: NativeReleaseCheckpointInput = {
  courseCount:1,lessonCount:4,allCoursesPublished:false,
  manifest:null,releasePoliciesComplete:false,offeringPublished:false,
};
const reviewKinds = ["academic","rights","accessibility","coverage","safety"] as const;

describe("native Offering release checkpoints: display only",()=>{
  it("never infers an Offering approval from manuscript or course presence",()=>{
    const rows=projectNativeReleaseCheckpoints(baseline);
    expect(rows.map(row=>row.status)).toEqual([
      "recorded","action_required","pending","pending","action_required",
      "pending","pending",
    ]);
    expect(rows.at(-1)?.detail).toContain("do not by themselves publish");
  });
  it("does not expose reviewer decisions when unavailable to the author",()=>{
    const rows=projectNativeReleaseCheckpoints({
      ...baseline,manifest:{current:true,status:"draft",assetCount:0},
    });
    expect(rows.find(row=>row.key==="review")?.status).toBe("unverified");
    expect(rows.find(row=>row.key==="review")?.detail).toContain(
      "not exposed in this creator view");
  });
  it("reports approved review records without claiming current authority",()=>{
    const rows=projectNativeReleaseCheckpoints({
      ...baseline,manifest:{current:true,status:"draft",assetCount:0},
      reviews:reviewKinds.map(kind=>({kind,decision:"approved" as const})),
    });
    expect(rows.find(row=>row.key==="review")?.status).toBe("recorded");
    expect(rows.find(row=>row.key==="review")?.detail).toContain(
      "rechecked by the publication command");
    expect(rows.find(row=>row.key==="assetApproval")?.status).toBe("pending");
  });
  it("does not treat stale or rejected decisions as approved",()=>{
    const reviews=reviewKinds.map(kind=>({
      kind,decision:kind==="rights"?"rejected" as const:"approved" as const,
    }));
    expect(projectNativeReleaseCheckpoints({
      ...baseline,manifest:{current:true,status:"draft",assetCount:3},reviews,
    }).find(row=>row.key==="review")?.status).toBe("action_required");
    const stale=projectNativeReleaseCheckpoints({
      ...baseline,manifest:{current:false,status:"approved",assetCount:3},
      releasePoliciesComplete:true,reviews,
    });
    expect(stale.find(row=>row.key==="submission")?.status).toBe("action_required");
    expect(stale.find(row=>row.key==="assetApproval")?.status).toBe("pending");
    expect(stale.find(row=>row.key==="review")?.status).toBe("pending");
  });
  it("keeps local adoption and enrollment out of publisher publication",()=>{
    const rows=projectNativeReleaseCheckpoints({
      ...baseline,allCoursesPublished:true,releasePoliciesComplete:true,
      manifest:{current:true,status:"approved",assetCount:3},
      offeringPublished:true,
      reviews:reviewKinds.map(kind=>({kind,decision:"approved" as const})),
    });
    expect(rows.every(row=>row.status==="recorded")).toBe(true);
    expect(rows.at(-1)?.detail).toContain("Local adoption and Class activation remain separate");
  });
});
