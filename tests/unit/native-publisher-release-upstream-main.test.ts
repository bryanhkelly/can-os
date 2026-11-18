import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");

describe("Neon main native publisher release upstream preflight",()=>{
  const probe=read("scripts/acceptance/check-main-native-course-release.mjs");

  it("refuses every database other than exact Neon main and remains read-only",()=>{
    expect(probe).toContain('const MAIN="br-restless-sea-ar9ooo55"');
    expect(probe).toContain("CAN_MAIN_NATIVE_RELEASE_CHECK");
    expect(probe).toContain("Refusing any database other than the verified CAN OS Neon main.");
    expect(probe).not.toMatch(/\b(?:INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP|CREATE)\s+(?:INTO\s+)?(?:TABLE|education_v30\.|public\.)/i);
  });

  it("reports real publisher authority and evidence instead of manufacturing approvals",()=>{
    for(const key of ["verifiedCreatorGrants","verifiedReviewerGrants",
      "verifiedPublisherEvidence","publisherAssetVersions",
      "approvedPublisherCapabilityAssignments","offeringBlueprintOutputs"]){
      expect(probe).toContain(key);
    }
    expect(probe).toContain("JOIN public.access_accounts acc");
    expect(probe).toContain("JOIN education_v30.professional_role_assignments a");
    expect(probe).toContain("JOIN education_v30.blueprint_execution_batches batch");
    expect(probe).toContain("batch.execution_status='executed'");
    expect(probe).toContain("verified_by_person_id IS NOT NULL");
    expect(probe).toContain("setupActions");
  });

  it("guards current operator/Site relationships and all three latest readiness decisions",()=>{
    expect(probe).toContain("currentApprovedOperationOperators");
    expect(probe).toContain("currentOperatorSitePaths");
    expect(probe).toContain("candidateReadyDeployments");
    expect(probe).toContain("DISTINCT ON (rr.deployment_id,rr.review_kind)");
    expect(probe).toContain("HAVING count(DISTINCT latest.review_kind)=3");
    expect(probe).toContain("site_role.organization_id=relation.organization_id");
    expect(probe).toContain('row.deployment_status==="active"&&row.operation_status==="active"');
    expect(probe).toContain("Do not set statuses in SQL.");
    expect(probe).toContain("DATA_PREFLIGHT_ONLY");
  });
});
