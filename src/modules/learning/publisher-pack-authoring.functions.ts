import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as input from "./publisher-pack-authoring.inputs";
import * as service from "./publisher-pack-authoring-http.server";
export const getPublisherPackStudio=createServerFn({method:"GET"})
 .validator((raw:unknown)=>input.studioInput.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.getPublisherPackStudioService(getRequest(),data);});

export const createAuthoredPublisherPack=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.createInput.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.createAuthoredPublisherPackService(getRequest(),data);});

export const startPublisherPackDraft=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.draftInput.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.startPublisherPackDraftService(getRequest(),data);});

export const saveAuthoredPublisherPack=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.saveInput.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.saveAuthoredPublisherPackService(getRequest(),data);});

export const publishAuthoredPublisherPack=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.publishInput.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.publishAuthoredPublisherPackService(getRequest(),data);});
