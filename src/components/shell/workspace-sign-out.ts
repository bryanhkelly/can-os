import { clearLearnerBrowserState } from "@/domain/session-client";

/** One shared account logout operation, used from workspace and Launch Studio.
 * Expiry-driven sign-in recovery is separate: explicit sign-out has no returnTo.
 */
export async function signOutOfWorkspace() {
  const response=await fetch("/access/logout",{
    method:"POST",credentials:"same-origin",
  });
  if(!response.ok)throw new Error("Unable to sign out. Please try again.");
  clearLearnerBrowserState();
  window.location.assign("/access");
}
