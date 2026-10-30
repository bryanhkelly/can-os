import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { listSiteLocalDelegations, setSiteLocalDelegation } from "./site-local-delegation.server";

const uuid = z.string().uuid();
const responsibility = z.enum(["site_director", "room_facilitator"]);
const scopeInput = z.object({ programId: uuid }).strict();
const setInput = scopeInput.extend({
  responsibility,
  action: z.enum(["appoint", "revoke"]),
  expectedAssignmentId: uuid.nullable(),
  personId: uuid.optional(),
  validThrough: z.string().datetime({ offset: true }).optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "appoint" && (!value.personId || !value.validThrough)) {
    ctx.addIssue({ code: "custom", message: "Choose a local staff member and expiration." });
  }
  if (value.action === "revoke" && (value.personId || value.validThrough)) {
    ctx.addIssue({ code: "custom", message: "Revocation must not reassign a person." });
  }
});

export type LocalSiteDelegationInput = z.infer<typeof setInput>;

/** Host registrar's planning roster: no pupils, protected school data or roster of other Sites. */
export const getLocalSiteDelegations = createServerFn({ method: "GET" })
  .validator((value: unknown) => scopeInput.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return listSiteLocalDelegations(await getCommandContext(getRequest()), data.programId);
  });

export const changeLocalSiteDelegation = createServerFn({ method: "POST" })
  .validator((value: unknown) => setInput.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return setSiteLocalDelegation(await getCommandContext(getRequest()), data);
  });
