import { AuthorizationError } from "./command-context";

/** A guardian's verified membership permits application submission only for
 * an active school they were actually granted. A CAN operating agreement is
 * checked separately and transactionally by the owning enrollment service.
 */
export function assertGuardianApplicationOpening(
  program: {status:string; organizationId:string; siteId:string|null} | null | undefined,
  scope: {organizationIds?:string[];siteIds?:string[]},
): void {
  if (!program || program.status !== "active" || !program.siteId ||
      !scope.organizationIds?.includes(program.organizationId) ||
      !scope.siteIds?.includes(program.siteId))
    throw new AuthorizationError("active school and authorized family application scope");
}
