import { logoutApiSession } from "@/lib/api/browser-session";
import { clearLearnerBrowserState } from "@/domain/session-client";

/** One shared account logout operation, used from workspace and Launch Studio.
 * Expiry-driven sign-in recovery is separate: explicit sign-out has no returnTo.
 */
export async function signOutOfWorkspace() {
  await logoutApiSession();
  clearLearnerBrowserState();
  window.location.assign("/access");
}
