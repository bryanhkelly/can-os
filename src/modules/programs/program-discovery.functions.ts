import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { programDiscoveryInputSchema } from "@/domain/program-discovery";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { getAvailableOfferings } from "./program-discovery.server";

export const discoverPrograms = createServerFn({ method: "GET" })
  .validator((input: unknown) => programDiscoveryInputSchema.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const context = await getCommandContext(getRequest());
    return getAvailableOfferings(context, data);
  });
