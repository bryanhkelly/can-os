import { documentUploadPolicy, isUploadFileCandidate } from "@/platform/storage/private-upload";

/** Client-only key to prevent sibling applications from sharing review drafts. */
export function familyRequirementKey(applicationId:string,requirementId:string):string {
 return JSON.stringify([applicationId,requirementId]);
}
export function isEnrollmentDocumentCandidate(file:Pick<File,"size"|"type">):boolean {
 return isUploadFileCandidate(file,documentUploadPolicy);
}
