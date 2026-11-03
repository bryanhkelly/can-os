import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { churchSuggestionFields } from "@/domain/church-source-references";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {
  readChurchContentSuggestions, readChurchSourceReviewContext, refreshChurchWebsiteSuggestions, reviewChurchSourceExcerpt, submitChurchSourceExcerpt,
} from "./church-content-suggestions.server";

function privateResponse() { setResponseHeader("Cache-Control", "private, no-store"); }

export const getChurchContentSuggestionView = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({}).strict().parse(value ?? {}))
  .handler(async () => {
    privateResponse();
    return readChurchContentSuggestions(await getCommandContext(getRequest()));
  });

export const getChurchSourceReviewContextView = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({}).strict().parse(value ?? {}))
  .handler(async () => {
    privateResponse();
    return readChurchSourceReviewContext(await getCommandContext(getRequest()));
  });

export const submitChurchSourceExcerptCommand = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    sourceReferenceId: z.string().uuid(), field: z.enum(churchSuggestionFields),
    text: z.string().min(1).max(2600), sourcePageUrl: z.string().url().max(2048),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    privateResponse();
    return submitChurchSourceExcerpt(await getCommandContext(getRequest()), data);
  });

export const reviewChurchSourceExcerptCommand = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    suggestionId: z.string().uuid(),
    decision: z.enum(["accepted", "edited", "discarded"]),
    editedText: z.string().max(2600).optional(),
    rightsConfirmed: z.boolean().optional(),
    expectedRevision: z.number().int().nonnegative().optional(),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    privateResponse();
    return reviewChurchSourceExcerpt(await getCommandContext(getRequest()), data);
  });


export const refreshChurchWebsiteSuggestionsCommand = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({}).strict().parse(value ?? {}))
  .handler(async () => {
    privateResponse();
    return refreshChurchWebsiteSuggestions(await getCommandContext(getRequest()));
  });
