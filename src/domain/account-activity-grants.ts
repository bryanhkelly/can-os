/**
 * Project participation visibility from verified CAN grants. A role selected
 * for navigation does not replace the underlying account/Person membership.
 * Staff and network grants are intentionally excluded from personal learning.
 */
export type AccountActivityGrant={
  id:string;accountId:string;personId:string;active:boolean;
  role:string;organizationId:string|null;siteId:string|null;
};
export type ActivityMembership=Pick<AccountActivityGrant,
  "id"|"role"|"organizationId"|"siteId"> & {organizationId:string};

export function selectActivityMemberships(
  grants:readonly AccountActivityGrant[],
  accountId:string,personId:string,
):{student:ActivityMembership[];guardian:ActivityMembership[]}{
  const samePerson=grants.filter(grant=>
    grant.active&&grant.accountId===accountId&&grant.personId===personId&&
    grant.organizationId!==null&&
    (grant.role==="student"||grant.role==="guardian"));
  const mapped=samePerson.map(grant=>({
    id:grant.id,role:grant.role,
    organizationId:grant.organizationId!,siteId:grant.siteId,
  }));
  return {
    student:mapped.filter(grant=>grant.role==="student"),
    guardian:mapped.filter(grant=>grant.role==="guardian"),
  };
}
export function activityMembershipCovers(
  membership:ActivityMembership,
  organizationId:string,siteId:string|null,
):boolean{
  return membership.organizationId===organizationId&&
    (membership.siteId===null||membership.siteId===siteId);
}
