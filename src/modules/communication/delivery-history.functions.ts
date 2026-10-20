import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { getCommandContext } from "@/modules/identity/command-context.server";

export const getDeliveryHistory = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ cursor: z.string().uuid().optional() }).parse(input))
  .handler(async ({ data }) => {
    const context = await getCommandContext(getRequest());
    setResponseHeader("Cache-Control", "no-store");
    const { listDeliveryHistory } = await import("./delivery-history.server");
    return listDeliveryHistory(context, data.cursor);
  });
