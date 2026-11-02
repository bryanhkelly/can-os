import { AuthorizationError } from "./command-context";

/** An existing authenticated email account may be linked to several site and
 * role grants for the SAME real adult. Those must not spawn a duplicate Person.
 * If multiple independent people are bound to that account, the public flow
 * cannot safely choose which identity should become a prospective guardian.
 */
export function uniqueAccountPersonId(
  grants:readonly {personId:string}[],
):string|undefined{
  const identities=[...new Set(grants.map(grant=>grant.personId))];
  if(identities.length>1)
    throw new AuthorizationError("ambiguous family identity: contact school admissions");
  return identities[0];
}
