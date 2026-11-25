/** Membership shape is a prerequisite, not resource-level authorization.
 * Account/platform grants carry no tenant. Every other role requires an
 * organization; a Site without its owning organization is never valid.
 * Exact Site/organization correspondence is independently checked on the server.
 */
export function hasValidAccessGrantScope(grant: {
  role: string;
  organizationId: string | null;
  siteId: string | null;
}): boolean {
  if (["account_holder", "app_admin", "platform_owner"].includes(grant.role)) {
    return grant.organizationId === null && grant.siteId === null;
  }
  return typeof grant.organizationId === "string" &&
    grant.organizationId.trim().length > 0 &&
    (grant.siteId === null ||
      (typeof grant.siteId === "string" && grant.siteId.trim().length > 0));
}
