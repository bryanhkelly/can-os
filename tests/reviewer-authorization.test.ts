import {describe,expect,it} from "vitest";
import {reviewerCanVerify} from "../src/domain/reviewer-authorization";
const orgA="org-a",orgB="org-b",reviewer="reviewer",subject="subject";
const context={actorPersonId:reviewer,capabilities:new Set(["profiles.credentials.verify"]),scope:{organizationIds:[orgA]}};
const reviewerRole={personId:reviewer,organizationId:orgA,siteId:null,programId:null,capabilities:["profiles.credentials.verify"]};
const base={context,subjectPersonId:subject,actorRoles:[reviewerRole],subjectRoles:[],actorMemberships:[{personId:reviewer,organizationId:orgA}],subjectMemberships:[{personId:subject,organizationId:orgA}]};
describe("independent tenant-bounded review",()=>{
 it("accepts a reviewer and target in the same organization",()=>expect(reviewerCanVerify(base)).toBe(true));
 it("rejects cross-school review even when subject has a role with the same site",()=>{
  expect(reviewerCanVerify({...base,subjectMemberships:[{personId:subject,organizationId:orgB}],subjectRoles:[{personId:subject,organizationId:orgB,siteId:"site-x",programId:null,capabilities:[]}]})).toBe(false);
 });
 it("rejects self-review and unscoped roles",()=>{
  expect(reviewerCanVerify({...base,subjectPersonId:reviewer})).toBe(false);
  expect(reviewerCanVerify({...base,context:{...context,scope:{organizationIds:[orgB]}}})).toBe(false);
 });
 it("restricts site-scoped reviewer to matching subject site and organization",()=>{
  const actorRoles=[{...reviewerRole,siteId:"site-a"}];
  const ctx={...context,scope:{organizationIds:[orgA],siteIds:["site-a"]}};
  expect(reviewerCanVerify({...base,context:ctx,actorRoles,subjectRoles:[{personId:subject,organizationId:orgA,siteId:"site-b",programId:null,capabilities:[]}]})).toBe(false);
  expect(reviewerCanVerify({...base,context:ctx,actorRoles,subjectRoles:[{personId:subject,organizationId:orgA,siteId:"site-a",programId:null,capabilities:[]}]})).toBe(true);
 });
});
