import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { interestEventCreateInput } from "@/domain/interest-events";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {
  createInterestEvent,
  listInterestEvents,
  rotateInterestEventInvitationLink,
} from "./interest-events.server";

export const listSchoolInterestEvents = createServerFn({ method: "GET" }).handler(async () => {
  setResponseHeader("Cache-Control", "private, no-store");
  return listInterestEvents(await getCommandContext(getRequest()));
});

export const createSchoolInterestEvent = createServerFn({ method: "POST" })
  .validator((value: unknown) => interestEventCreateInput.parse(value))
  .handler(async ({ data }) => createInterestEvent(
    await getCommandContext(getRequest()), data,
  ));

export const rotateSchoolInterestEventLink = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ eventId: z.string().uuid() }).strict().parse(value))
  .handler(async ({ data }) => rotateInterestEventInvitationLink(
    await getCommandContext(getRequest()), data.eventId,
  ));
