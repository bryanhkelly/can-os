import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {launchDraftSelectionSchema,saveLaunchDraftSchema} from "@/domain/launch-draft";
import {getStaffLaunchWorkspaceService,getLaunchStudioDraftService,saveLaunchStudioDraftService} from "./launch-drafts.server";
export const getStaffLaunchWorkspace=createServerFn({method:"GET"}).handler(async()=>{setResponseHeader("Cache-Control","private, no-store");return getStaffLaunchWorkspaceService(getRequest());});
export const getLaunchStudioDraft=createServerFn({method:"GET"}).validator((raw:unknown)=>launchDraftSelectionSchema.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return getLaunchStudioDraftService(getRequest(),data);});
export const saveLaunchStudioDraft=createServerFn({method:"POST"}).validator((raw:unknown)=>saveLaunchDraftSchema.parse(raw)).handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return saveLaunchStudioDraftService(getRequest(),data);});
