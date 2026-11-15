import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
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
    // This endpoint returns no canonical data, even when an unrelated native
    // cookie is present. The verified CAN Site grant alone grants the static
    // design preview, not the protected canonical publisher.
    const actor = await getCommandContext(request);
    if (!canPreviewEnrollmentLabAsSiteStaff(actor)) {
      throw new AuthorizationError("authorized Site administrator or registrar");
    }
    return { readOnlySchoolPreview: true as const };
  });
