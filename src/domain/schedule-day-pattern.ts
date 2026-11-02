import { z } from "zod";

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
export const scheduleDayPattern = z.object({
  weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7)
    .refine(days => new Set(days).size === days.length, "Choose each weekday once"),
  startsAtLocal: time,
  endsAtLocal: time,
}).strict().refine(pattern => pattern.endsAtLocal > pattern.startsAtLocal,
  "Instruction must end after it starts on the same day");

export const defaultScheduleDayPattern = {
  weekdays: [1, 2, 3, 4, 5], startsAtLocal: "08:30", endsAtLocal: "15:00",
};
