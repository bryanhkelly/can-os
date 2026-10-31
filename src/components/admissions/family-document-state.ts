/** Client-only key to prevent sibling applications from sharing review drafts. */
export function familyRequirementKey(applicationId:string,requirementId:string):string {
 return JSON.stringify([applicationId,requirementId]);
}
export function isEnrollmentDocumentCandidate(file:Pick<File,"size"|"type">):boolean {
 return file.size>0&&file.size<=10*1024*1024&&["application/pdf","image/png","image/jpeg"].includes(file.type);
}
