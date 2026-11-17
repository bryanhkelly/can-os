import {
  AuthorizationError,assertCapability,type CommandContext,
} from "./command-context";

/** Local reporting is an existing operating privilege, never inherited from a
 * Class teaching assignment, affiliate directory entry, network membership,
 * favorite Site or raw URL. The server must ALSO validate current canonical
 * Operation, Site, publisher, Course and Deployment grants inside the same
 * read transaction. This function merely hardens the initial principal gate.
 */
export function assertExactClassReportingScope(
  actor:CommandContext,
  subject:{operatingOrganizationId:string;siteId:string|null},
):void{
  if(!actor.actorPersonId||!["site_admin","registrar"].includes(actor.role??""))
    throw new AuthorizationError("current provider Class reporting operator");
  assertCapability(actor,"class.manage");
  const organizations=actor.scope.organizationIds??[];
  if(organizations.length!==1 ||
     organizations[0]!==subject.operatingOrganizationId)
    throw new AuthorizationError("exact operating Organization");
  if(!subject.siteId||!actor.scope.siteIds?.includes(subject.siteId))
    throw new AuthorizationError("currently authorized delivery Site");
}
