import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { createRoomAtSiteSchema, roomCoverageScopeSchema, saveRoomCoverageSchema } from "@/domain/room-coverage";
import { getRoomCoverageWorkspace, saveRoomCoverage } from "./room-coverage.server";
import { createRoomAtSite } from "./site-rooms.server";

export const getRoomCoverageWorkspaceFn = createServerFn({ method: "GET" })
  .validator((value: unknown) => roomCoverageScopeSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return getRoomCoverageWorkspace(await getCommandContext(getRequest()), data);
  });
export const saveRoomCoverageFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => saveRoomCoverageSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return saveRoomCoverage(await getCommandContext(getRequest()), data);
  });
export const createRoomAtSiteFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => createRoomAtSiteSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return createRoomAtSite(await getCommandContext(getRequest()), data);
  });
