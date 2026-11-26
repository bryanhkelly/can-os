import { AuthorizationError } from "./command-context";

export type NoncreditParticipantCredential = {
  demoScope: { organizationId: string; siteId: string } | null;
};

/** Credential scope is checked in addition to the ordinary release rules. */
export function assertNoncreditParticipantRelease(
  owner: NoncreditParticipantCredential,
  release: { registeringOrganizationId: string; siteId: string | null },
): void {
  if (owner.demoScope && (
    owner.demoScope.organizationId !== release.registeringOrganizationId ||
    owner.demoScope.siteId !== release.siteId
  )) {
    throw new AuthorizationError("participant credential eligible for this release");
  }
}
