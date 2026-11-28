import {z} from "zod";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {parseCommandInput} from "@/domain/command-input";
import {createInstructionalTrackDraft,saveInstructionalTrackDraft,submitInstructionalTrack,reviewInstructionalTrack,publishInstructionalTrack,withdrawInstructionalTrack,readCreatorTrackDraft,createInstructionalTrackDraftSchema,saveInstructionalTrackDraftSchema,instructionalTrackReleaseSchema,reviewInstructionalTrackSchema,withdrawInstructionalTrackSchema} from "./instructional-track-authoring.server";
const read=z.object({trackVersionId:z.string().uuid()}).strict();
export async function createRecordedInstructionDraftService(request:Request,raw:unknown){
 const input=parseCommandInput(createInstructionalTrackDraftSchema,raw);
 return createInstructionalTrackDraft(await getCommandContext(request),input);
}
export async function saveRecordedInstructionDraftService(request:Request,raw:unknown){
 const input=parseCommandInput(saveInstructionalTrackDraftSchema,raw);
 return saveInstructionalTrackDraft(await getCommandContext(request),input);
}
export async function submitRecordedInstructionDraftService(request:Request,raw:unknown){
 const input=parseCommandInput(instructionalTrackReleaseSchema,raw);
 return submitInstructionalTrack(await getCommandContext(request),input);
}
export async function decideRecordedInstructionReviewService(request:Request,raw:unknown){
 const input=parseCommandInput(reviewInstructionalTrackSchema,raw);
 return reviewInstructionalTrack(await getCommandContext(request),input);
}
export async function publishRecordedInstructionService(request:Request,raw:unknown){
 const input=parseCommandInput(instructionalTrackReleaseSchema,raw);
 return publishInstructionalTrack(await getCommandContext(request),input);
}
export async function withdrawRecordedInstructionService(request:Request,raw:unknown){
 const input=parseCommandInput(withdrawInstructionalTrackSchema,raw);
 return withdrawInstructionalTrack(await getCommandContext(request),input);
}
export async function getCreatorRecordedInstructionDraftService(request:Request,raw:unknown){
 const input=parseCommandInput(read,raw);
 return readCreatorTrackDraft(await getCommandContext(request),input.trackVersionId);
}
