import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { churchReferenceKinds } from "@/domain/church-source-references";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {
  readChurchSourceReferences, removeChurchSourceReference, saveChurchSourceReference,
} from "./church-source-references.server";

function privateResponse() { setResponseHeader("Cache-Control", "private, no-store"); }

export const getChurchSourceReferenceView = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({}).strict().parse(value ?? {}))
  .handler(async () => {
    privateResponse();
    const actor = await getCommandContext(getRequest());
    return readChurchSourceReferences(actor);
  });

export const saveChurchSourceReferenceCommand = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    kind: z.enum(churchReferenceKinds),
    url: z.string().min(1).max(2048),
    authorizedToSubmit: z.literal(true),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    privateResponse();
    const actor = await getCommandContext(getRequest());
    return saveChurchSourceReference(actor, data);
  });

export const removeChurchSourceReferenceCommand = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    kind: z.enum(churchReferenceKinds),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    privateResponse();
    const actor = await getCommandContext(getRequest());
    return removeChurchSourceReference(actor, data);
  });
