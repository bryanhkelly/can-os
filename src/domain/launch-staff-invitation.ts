/** Navigation defaults only. The invitation command must verify the actor,
 * exact Site and role again; a URL never grants access. */
import { localStaffInviteRoles } from "@/domain/staff-onboarding-policy";

export function launchStaffInvitationDefaults(
  sites: readonly { id: string }[],
  selection: { siteId?: string; inviteRole?: string },
) {
  const role: (typeof localStaffInviteRoles)[number] = selection.inviteRole === "registrar" || selection.inviteRole === "site_website_editor"
    ? selection.inviteRole : "teacher";
  const unavailable = Boolean(selection.siteId && !sites.some(site => site.id === selection.siteId));
  const siteId = selection.siteId
    ? sites.find(site => site.id === selection.siteId)?.id ?? ""
    : sites.length === 1 ? sites[0]!.id : "";
  return { role, siteId, unavailable };
}
