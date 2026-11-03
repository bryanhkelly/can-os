import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { getCommandContext } from "@/modules/identity/command-context.server";
import { assignSectionRoomSchema, createSiteRoomSchema, retireSiteRoomSchema, siteRoomsScopeSchema, updateSiteRoomSchema } from "@/domain/site-rooms";
import { assignSchoolSectionRoom, createSchoolRoom, getSchoolRooms, retireSchoolRoom, updateSchoolRoom } from "./site-rooms.server";

export const getSchoolRoomsFn = createServerFn({ method: "GET" })
  .validator((value: unknown) => siteRoomsScopeSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return getSchoolRooms(await getCommandContext(getRequest()), data);
  });

export const createSchoolRoomFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => createSiteRoomSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return createSchoolRoom(await getCommandContext(getRequest()), data);
  });

export const assignSchoolSectionRoomFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => assignSectionRoomSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return assignSchoolSectionRoom(await getCommandContext(getRequest()), data);
  });

export const updateSchoolRoomFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => updateSiteRoomSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return updateSchoolRoom(await getCommandContext(getRequest()), data);
  });

export const retireSchoolRoomFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => retireSiteRoomSchema.parse(value))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    return retireSchoolRoom(await getCommandContext(getRequest()), data);
  });
