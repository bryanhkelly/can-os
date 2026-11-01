/** Shared Site Today may show sensitive custody work only to the current
 * specifically delegated director who owns that case Action.
 */
export const privatePickupActionTypes=[
 "onsite_pickup_custody_hold",
 "pickup_custody_resolution_proposal",
 "onsite_pickup_denied_follow_up",
 "onsite_pickup_uncollected_child",
] as const;
export function mayShowPrivatePickupAction(
 action:{type:string;programId:string|null;ownerPersonId:string|null},
 viewer:{role:string;personId:string|null;authorizedPrograms:ReadonlySet<string>},
):boolean{
 if(!privatePickupActionTypes.some(kind=>kind===action.type))return true;
 return viewer.role==="site_leader" && !!viewer.personId &&
   action.ownerPersonId===viewer.personId && !!action.programId &&
   viewer.authorizedPrograms.has(action.programId);
}
