import { z } from "zod";

export const enrollmentFormSchema = z.object({
  version: z.string().trim().min(1).max(40),
  instructions: z.string().trim().min(1).max(10000),
  consent: z.string().trim().min(10).max(10000),
  fields: z.array(z.object({
    key: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
    label: z.string().trim().min(1).max(200),
    type: z.enum(["text", "yes_no"]),
    required: z.boolean(),
  }).strict()).max(30),
}).strict().superRefine((form, context) => {
  if (new Set(form.fields.map(field => field.key)).size !== form.fields.length)
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Enrollment form field keys must be unique." });
});
export type EnrollmentForm = z.infer<typeof enrollmentFormSchema>;
export const enrollmentFormAnswersSchema = z.record(z.union([z.string().max(4000), z.boolean()]));
export type EnrollmentFormAnswers = z.infer<typeof enrollmentFormAnswersSchema>;
export function enrollmentJourneyDefinitionKey(metadata: Record<string, unknown>, requestedKey?: string) {
  const configured = metadata.enrollmentJourneyDefinitionKey;
  if (configured === undefined) return requestedKey ?? "family-enrollment";
  const key = z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9._:-]+$/).parse(configured);
  if (requestedKey !== undefined && requestedKey !== key)
    throw new Error("The program's configured enrollment Journey cannot be overridden.");
  return key;
}
const submissionSchema = z.object({
  kind: z.literal("enrollment_form_submission"), id: z.string().uuid(),
  formRevision: z.string().regex(/^[a-f0-9]{64}$/), form: enrollmentFormSchema,
  answers: enrollmentFormAnswersSchema, signerPersonId: z.string().uuid(),
  signerName: z.string().min(2).max(200), signedAt: z.string().datetime(),
});
const reviewSchema = z.object({
  kind: z.literal("enrollment_form_review"), submissionId: z.string().uuid(),
  status: z.enum(["accepted", "rejected"]), reason: z.string().min(5).max(400),
  reviewerPersonId: z.string().uuid(), reviewedAt: z.string().datetime(),
});

export function validateEnrollmentFormAnswers(form: EnrollmentForm, input: EnrollmentFormAnswers): EnrollmentFormAnswers {
  if (Object.keys(input).some(key => !form.fields.some(field => field.key === key)))
    throw new Error("Answers contain a field that is not in this enrollment form.");
  const answers: EnrollmentFormAnswers = {};
  for (const field of form.fields) {
    const value = input[field.key];
    if (value === undefined) {
      if (field.required) throw new Error(`Complete ${field.label} before signing.`);
      continue;
    }
    if (field.type === "text") {
      if (typeof value !== "string" || value.length > 4000) throw new Error(`Enter text for ${field.label}.`);
      if (field.required && !value.trim()) throw new Error(`Complete ${field.label} before signing.`);
      answers[field.key] = value.trim();
    } else {
      if (typeof value !== "boolean") throw new Error(`Choose Yes or No for ${field.label}.`);
      answers[field.key] = value;
    }
  }
  return answers;
}

export function enrollmentFormState(metadata: Record<string, unknown>, evidence: Record<string, unknown>[]) {
  if (metadata.enrollmentForm === undefined) return null;
  const form = enrollmentFormSchema.parse(metadata.enrollmentForm);
  const entry = [...evidence].reverse().find(item => item.kind === "enrollment_form_submission");
  const submission = entry ? submissionSchema.parse(entry) : null;
  const decision = submission ? [...evidence].reverse().find(item =>
    item.kind === "enrollment_form_review" && item.submissionId === submission.id) : undefined;
  return { form, submission, review: decision ? reviewSchema.parse(decision) : null };
}

export function assertEnrollmentFormApproved(metadata: Record<string, unknown>, evidence: Record<string, unknown>[]) {
  const state = enrollmentFormState(metadata, evidence);
  if (!state) return;
  if (!state.submission || state.review?.status !== "accepted" ||
      JSON.stringify(state.submission.form) !== JSON.stringify(state.form))
    throw new Error("A required enrollment form needs a current guardian signature and registrar approval.");
  validateEnrollmentFormAnswers(state.form, state.submission.answers);
}
