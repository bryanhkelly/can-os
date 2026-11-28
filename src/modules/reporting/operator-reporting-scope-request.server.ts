import { getIdentityContext } from "@/modules/identity/command-context.server";
import { resolveCanonicalProvider } from "@/modules/operations/canonical-provider-access.server";
import { accessSessionCookie } from "@/domain/access-tokens";
import { readCookie } from "@/domain/session-cookies";
import { resolveOperatorReportingScope } from "@/domain/operator-reporting-scope";

/** Reporting only: the current verified CAN grant already authorizes its own
 * Site's operational insights. Do not require a second provider projection.
 * Existing native provider sessions retain their independent authorization.
 * A present but invalid CAN credential never falls back to native authority.
 * All report readers must independently constrain facts to returned org/Sites.
 */
export async function resolveOperatorReportingScopeRequest(request:Request) {
  if (readCookie(request, accessSessionCookie) !== undefined) {
    return resolveOperatorReportingScope(await getIdentityContext(request));
  }
  return resolveCanonicalProvider(request,"noncredit.enrollment.read");
}
