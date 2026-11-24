import { z } from "zod";

/** Typed management state. Revocation is terminal; pausing preserves the code. */
export const goLinkStatusSchema = z.enum(["active","paused","revoked"]);
export type GoLinkStatus = z.infer<typeof goLinkStatusSchema>;
export const goLinkChannelSchema = z.enum(["email","flyer","qr","social","partner","other"]);
export type GoLinkChannel = z.infer<typeof goLinkChannelSchema>;

export const goLinkManagementSchema = z.object({
  name: z.string().trim().min(1).max(120),
  channel: goLinkChannelSchema.nullable().optional(),
  startsAt: z.string().datetime({offset:true}).nullable().optional(),
  expiresAt: z.string().datetime({offset:true}).nullable().optional(),
}).strict().refine(value => !value.startsAt || !value.expiresAt ||
  Date.parse(value.expiresAt) > Date.parse(value.startsAt), {
    message:"Expiry must be later than activation",
  });

export type GoLinkAvailability =
  | "available" | "scheduled" | "expired" | "paused" | "revoked";

export function goLinkAvailability(input: {
  status:GoLinkStatus; startsAt:Date|null; expiresAt:Date|null;
}, now:Date = new Date()): GoLinkAvailability {
  if (input.status === "revoked") return "revoked";
  if (input.status === "paused") return "paused";
  if (input.startsAt && now < input.startsAt) return "scheduled";
  if (input.expiresAt && now >= input.expiresAt) return "expired";
  return "available";
}
export function goLinkStatusTransition(from:GoLinkStatus, to:"active"|"paused"|"revoked"):GoLinkStatus {
  if (from==="revoked" && to!=="revoked") throw new Error("Revocation is permanent");
  return to;
}
