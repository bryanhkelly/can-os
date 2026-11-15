import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { canonicalSessionCookie } from "@/domain/canonical-access";
import { AuthorizationError } from "@/domain/command-context";
import { canPreviewEnrollmentLabAsSiteStaff } from "@/domain/enrollment-lab-access";
import { getCommandContext } from "@/modules/identity/command-context.server";

/**
 * Only permits rendering the informational enrollment design preview.
 * Never return canonical training, participant, assessment or Site records.
 */
export const getLegacyEnrollmentLabPreviewAccess = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const request = getRequest();
    const cookies = request.headers.get("cookie") ?? "";
    // A stale or unauthorized canonical session must not downgrade to a
    // legacy session, even if the browser also has a school login cookie.
    if (cookies.split(";").some(cookie =>
      cookie.trim().startsWith(canonicalSessionCookie + "="))) {
      throw new AuthorizationError("valid canonical session required");
    }

    const actor = await getCommandContext(request);
    if (!canPreviewEnrollmentLabAsSiteStaff(actor)) {
      throw new AuthorizationError("authorized Site administrator or registrar");
    }
    return { readOnlySchoolPreview: true as const };
  });
