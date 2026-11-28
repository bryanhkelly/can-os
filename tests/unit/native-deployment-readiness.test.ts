import {describe,it,expect} from "vitest";
import {deploymentReadinessCommand,sameDeploymentReadinessReceipt} from "@/domain/native-deployment-readiness";
import {roleCapabilities} from "@/domain/access-context";
import {hasValidAccessGrantScope} from "@/domain/access-grant-scope";
import {platformOwnerMayActAs} from "@/domain/platform-owner-delegation";
import {privateAccountRoleEligible} from "@/domain/private-account-authority";
const id=(n:number)=>"10000000-0000-4000-8000-"+String(n).padStart(12,"0");
const data=deploymentReadinessCommand.parse({deploymentId:id(1),reviewId:id(2),reviewKind:"registration",
 outcome:"ready",evidenceVersionId:id(3),expiresAt:"2027-01-01T00:00:00Z",supersedesId:null});
const prior={...data,id:data.reviewId,evaluatedByPersonId:id(4),expiresAt:new Date(data.expiresAt)};
describe("deployment readiness",()=>{
 it("requires independent organization-only review",()=>{
  expect(roleCapabilities.deployment_readiness_reviewer).toEqual(["deployment.readiness.review"]);
  expect(hasValidAccessGrantScope({role:"deployment_readiness_reviewer",organizationId:id(1),siteId:null})).toBe(true);
  expect(hasValidAccessGrantScope({role:"deployment_readiness_reviewer",organizationId:id(1),siteId:id(2)})).toBe(false);
  expect(platformOwnerMayActAs("deployment_readiness_reviewer")).toBe(false);
  expect(privateAccountRoleEligible("deployment_readiness_reviewer")).toBe(false);
 });
 it("accepts exact retries and rejects changed decisions",()=>{
  expect(sameDeploymentReadinessReceipt(prior,data,id(4))).toBe(true);
  expect(sameDeploymentReadinessReceipt(prior,{...data,outcome:"not_ready"},id(4))).toBe(false);
  expect(sameDeploymentReadinessReceipt(prior,{...data,evidenceVersionId:id(5)},id(4))).toBe(false);
  expect(sameDeploymentReadinessReceipt(prior,data,id(5))).toBe(false);
  expect(deploymentReadinessCommand.safeParse({...data,supersedesId:data.reviewId}).success).toBe(false);
 });
});
