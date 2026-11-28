import {parseCommandInput} from "@/domain/command-input";
import {requireCurriculumPublisher} from "./curriculum-publisher-access.server";
import * as input from "./publisher-pack-authoring.inputs";
import {createPublisherPack,createPublisherPackDraft,publishPublisherPack,readPublisherPackStudio,savePublisherPackDraft} from "./publisher-pack-authoring.server";

export async function getPublisherPackStudioService(request:Request,raw:unknown){
 const data=parseCommandInput(input.studioInput,raw);
 return readPublisherPackStudio(await requireCurriculumPublisher(request),data.programId);
}
export async function createAuthoredPublisherPackService(request:Request,raw:unknown){
 const data=parseCommandInput(input.createInput,raw);
 return createPublisherPack(await requireCurriculumPublisher(request),data);
}
export async function startPublisherPackDraftService(request:Request,raw:unknown){
 const data=parseCommandInput(input.draftInput,raw);
 return createPublisherPackDraft(await requireCurriculumPublisher(request),data);
}
export async function saveAuthoredPublisherPackService(request:Request,raw:unknown){
 const data=parseCommandInput(input.saveInput,raw);
 return savePublisherPackDraft(await requireCurriculumPublisher(request),data);
}
export async function publishAuthoredPublisherPackService(request:Request,raw:unknown){
 const data=parseCommandInput(input.publishInput,raw);
 return publishPublisherPack(await requireCurriculumPublisher(request),data);
}
