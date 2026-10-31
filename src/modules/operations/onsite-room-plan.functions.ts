import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { submitRoomPlanSchema } from "@/domain/onsite-room-plan";
import { submitOnsiteRoomPlan } from "./onsite-room-plan.server";

export const submitOnsiteRoomPlanFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => submitRoomPlanSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return submitOnsiteRoomPlan(await getCommandContext(getRequest()), data);
  });
