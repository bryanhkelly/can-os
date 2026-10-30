import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActor } from "@/modules/identity/actors.server";
import { catalogStewardCapability, createQualificationDefinition } from "./qualification-catalog.server";

export const createQualificationCatalogEntry = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    programId: z.string().uuid(),
    key: z.string().trim().min(3).max(100).regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
      "Use a stable lowercase key with letters, numbers and single dot, dash or underscore separators"),
    title: z.string().trim().min(3).max(200),
    kind: z.string().trim().min(2).max(64).regex(/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/,
      "Use a lowercase classification key"),
    reason: z.string().trim().min(10).max(2000),
    confirmed: z.literal(true),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["registrar"], catalogStewardCapability);
    return createQualificationDefinition(actor, data);
  });
