import { z } from "zod";

export const churchApplicationLimits = {
  churchName: 160, siteName: 160, firstName: 80, lastName: 80,
  leaderTitle: 100, contactEmail: 254, churchWebsite: 500,
} as const;

const text = (min: number, max: number) => z.string().trim()
  .min(min, `Enter at least ${min} character${min === 1 ? "" : "s"}.`)
  .max(max, `Use no more than ${max} characters.`);

/** The public form and its server handler validate the same normalized payload. */
export const churchApplicationSchema = z.object({
  churchName: text(2, churchApplicationLimits.churchName),
  siteName: text(2, churchApplicationLimits.siteName),
  timezone: text(3, 80),
  churchWebsite: z.string().trim().max(churchApplicationLimits.churchWebsite)
    .refine(value => !value || (z.string().url().safeParse(value).success && value.startsWith("https://")),
      "Enter a complete website address starting with https://, or leave it blank.").optional(),
  leaderTitle: text(2, churchApplicationLimits.leaderTitle),
  contactEmail: z.string().trim().email("Enter a valid email address.")
    .max(churchApplicationLimits.contactEmail).toLowerCase(),
  firstName: text(1, churchApplicationLimits.firstName),
  lastName: text(1, churchApplicationLimits.lastName),
}).strict();

export type ChurchApplicationField = keyof z.infer<typeof churchApplicationSchema>;
