/** Public navigation authority is the engagement's verified owner, never an
 * arbitrary UUID in the link. Extracted for independent security tests. */
export type PublicEngagementOwnerScope={
  ownerKind:"platform"|"organization"|"site"|"program";
  organizationId:string|null;
  siteId:string|null;
  programId:string|null;
};
export function engagementOwnerAllowsSite(
  owner:PublicEngagementOwnerScope,
  site:{id:string;organizationId:string;status:string}|null,
):boolean{
  if(!site || site.status==="closed")return false;
  if(owner.ownerKind==="platform")
    return owner.organizationId===null && owner.siteId===null && owner.programId===null;
  if(!owner.organizationId || owner.organizationId!==site.organizationId)return false;
  if(owner.ownerKind==="organization")return owner.siteId===null && owner.programId===null;
  if(!owner.siteId || owner.siteId!==site.id)return false;
  return owner.ownerKind==="site" || owner.ownerKind==="program";
}
