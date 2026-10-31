import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

/** Church-onboarding-only endpoint; do not expand shared network-steward route contracts. */
const followupSchema = z.object({
  requestId: z.string().uuid(),
  note: z.string().trim().min(15).max(1000),
}).strict();

export const requestChurchOnboardingEvidence = createServerFn({ method: "POST" })
  .validator((value: unknown) => followupSchema.parse(value))
  .handler(async ({ data }) => {
    const [{ getCommandContext }, { requestAdditionalChurchEvidence }] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./church-applications.server"),
    ]);
    return requestAdditionalChurchEvidence(await getCommandContext(getRequest()), data.requestId, data.note);
  });
