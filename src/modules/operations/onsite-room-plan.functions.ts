import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { submitRoomPlanSchema, reviewRoomPlanSchema, roomPlanBlockSchema } from "@/domain/onsite-room-plan";
import { submitOnsiteRoomPlan, reviewOnsiteRoomPlan, getOnsiteRoomPlanning } from "./onsite-room-plan.server";

export const submitOnsiteRoomPlanFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => submitRoomPlanSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return submitOnsiteRoomPlan(await getCommandContext(getRequest()), data);
  });

export const reviewOnsiteRoomPlanFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => reviewRoomPlanSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return reviewOnsiteRoomPlan(await getCommandContext(getRequest()), data);
  });

export const getOnsiteRoomPlanningFn = createServerFn({ method: "GET" })
  .validator((value: unknown) => roomPlanBlockSchema.pick({programId:true,date:true}).parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return getOnsiteRoomPlanning(await getCommandContext(getRequest()), data);
  });
