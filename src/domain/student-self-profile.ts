import { z } from "zod";

export const studentSelfProfileSchema = z.object({
  preferredName: z.string().trim().max(80).nullable(),
  preferredPronouns: z.string().trim().max(60).nullable(),
  interests: z.array(z.string().trim().min(1).max(80)).max(8),
}).superRefine((profile, context) => {
  const interests = profile.interests.map(value => value.toLowerCase());
  if (new Set(interests).size !== interests.length) {
    context.addIssue({
      code: "custom",
      path: ["interests"],
      message: "Interests must be unique.",
    });
  }
});

export type StudentSelfProfile = z.infer<typeof studentSelfProfileSchema>;
