import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { readOwnerPilotLocations, provisionOwnerPilotRole } from "./platform-owner-pilot-access.server";
import { ownerPilotGrantInput } from "@/domain/platform-owner-pilot-roles";

const noStore=()=>setResponseHeader("Cache-Control","private, no-store");
export const getPlatformOwnerPilotLocations=createServerFn({method:"GET"})
  .handler(async()=>{noStore();return readOwnerPilotLocations(getRequest());});
export const grantPlatformOwnerPilotRole=createServerFn({method:"POST"})
  .validator((input:unknown)=>ownerPilotGrantInput.parse(input))
  .handler(async({data})=>{noStore();return provisionOwnerPilotRole(getRequest(),data);});
