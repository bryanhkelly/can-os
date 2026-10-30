import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { enrollmentFormAnswersSchema } from "@/domain/enrollment-form";
import { requireActor } from "@/modules/identity/actors.server";
import { reviewEnrollmentForm, signEnrollmentForm } from "./enrollment-form.server";

const requirement = z.object({ applicationId: z.string().uuid(), requirementId: z.string().uuid() });
export const submitGuardianEnrollmentForm = createServerFn({ method: "POST" })
  .validator((value: unknown) => requirement.extend({ requestId: z.string().uuid(),
    formRevision: z.string().regex(/^[a-f0-9]{64}$/), answers: enrollmentFormAnswersSchema,
    signerName: z.string().trim().min(2).max(200), confirmed: z.literal(true) }).strict().parse(value))
  .handler(async ({ data }) => signEnrollmentForm(await requireActor(["guardian"], "enrollment.apply"), data));
export const decideEnrollmentForm = createServerFn({ method: "POST" })
  .validator((value: unknown) => requirement.extend({ submissionId: z.string().uuid(),
    status: z.enum(["accepted", "rejected"]), reason: z.string().trim().min(5).max(400),
    confirmed: z.literal(true) }).strict().parse(value))
  .handler(async ({ data }) => reviewEnrollmentForm(await requireActor(["registrar"], "enrollment.decide"), data));
