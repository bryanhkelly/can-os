import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { familyInvitationSendInput } from "@/domain/family-invitations";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {
  listFamilyInvitationWorkspace,
  sendFamilyInvitationBatch,
} from "./family-invitations.server";

export const listFamilyInvitations = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  const context = await getCommandContext(getRequest());
  return listFamilyInvitationWorkspace(context);
});

export const sendFamilyInvitations = createServerFn({ method: "POST" })
  .validator((value: unknown) => familyInvitationSendInput.parse(value))
  .handler(async ({ data }) => {
    const context = await getCommandContext(getRequest());
    return sendFamilyInvitationBatch(context, data);
  });
