import { z } from "zod";

/** Shared zod primitives for server-function validators. */

export const uuid = z.string().uuid();

export const uuidParam = z.string().uuid({ message: "Expected a UUID parameter" });

export const paginationSchema = z.object({
  cursor: uuid.optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export const dateRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    message: "from must be on or before to",
    path: ["from"],
  });

export const monthParamSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Expected a YYYY-MM month");
