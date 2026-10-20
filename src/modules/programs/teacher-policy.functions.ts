import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActor } from "@/modules/identity/actors.server";
import { reviseLaunchTeacherRequirements, teacherPolicyPublisherCapability } from "./teacher-policy.server";

export const reviseLaunchTeacherPolicy = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    programId: z.string().uuid(), expectedVersionId: z.string().uuid(),
    qualificationKeys: z.array(z.string().min(1).max(100)).min(1).max(100),
    effectiveFrom: z.string().datetime({ offset: true }),
    reason: z.string().trim().min(10).max(2000), confirmed: z.literal(true),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["registrar"], teacherPolicyPublisherCapability);
    return reviseLaunchTeacherRequirements(actor, data);
  });
