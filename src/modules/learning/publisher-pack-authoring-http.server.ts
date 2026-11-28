import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {rolesAllow} from "@/domain/school-roles";
import {parseCommandInput} from "@/domain/command-input";
import type {Actor} from "@/modules/identity/actors.server";
import * as input from "./publisher-pack-authoring.inputs";
import {createPublisherPack,createPublisherPackDraft,publishPublisherPack,readPublisherPackStudio,savePublisherPackDraft} from "./publisher-pack-authoring.server";

// Retains the original registrar/curriculum.publish gate and the service's
// institutional Program/Site scope. This is the existing pack model only.
async function actor(request:Request):Promise<Actor>{
 const context=await getCommandContext(request);
 if(!context.actorPersonId||!rolesAllow(["registrar"],context.role))
  throw new AuthorizationError("publisher registrar role");
 assertCapability(context,"curriculum.publish");
 return context as Actor;
}
export async function getPublisherPackStudioService(request:Request,raw:unknown){
 const data=parseCommandInput(input.studioInput,raw);
 return readPublisherPackStudio(await actor(request),data.programId);
}
export async function createAuthoredPublisherPackService(request:Request,raw:unknown){
 const data=parseCommandInput(input.createInput,raw);
 return createPublisherPack(await actor(request),data);
}
export async function startPublisherPackDraftService(request:Request,raw:unknown){
 const data=parseCommandInput(input.draftInput,raw);
 return createPublisherPackDraft(await actor(request),data);
}
export async function saveAuthoredPublisherPackService(request:Request,raw:unknown){
 const data=parseCommandInput(input.saveInput,raw);
 return savePublisherPackDraft(await actor(request),data);
}
export async function publishAuthoredPublisherPackService(request:Request,raw:unknown){
 const data=parseCommandInput(input.publishInput,raw);
 return publishPublisherPack(await actor(request),data);
}
