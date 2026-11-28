import {parseCommandInput} from "@/domain/command-input";
import {requireCurriculumPublisher} from "./curriculum-publisher-access.server";
import * as input from "./curriculum-authoring.inputs";
import {readCurriculumPrograms,readCurriculumStudio,createCurriculumCourse,createCurriculumDraft,saveCurriculumDraft,saveCurriculumLesson,publishCurriculumDraft} from "./curriculum-authoring.server";
export async function getCurriculumProgramsService(request:Request,raw:unknown){
 parseCommandInput(input.empty,raw);
 return readCurriculumPrograms(await requireCurriculumPublisher(request));
}
export async function getCurriculumStudioService(request:Request,raw:unknown){
 const data=parseCommandInput(input.program,raw);
 return readCurriculumStudio(await requireCurriculumPublisher(request),data.programId);
}
export async function createAuthoredCourseService(request:Request,raw:unknown){
 const data=parseCommandInput(input.create,raw);
 return createCurriculumCourse(await requireCurriculumPublisher(request),data);
}
export async function startCurriculumDraftService(request:Request,raw:unknown){
 const data=parseCommandInput(input.draft,raw);
 return createCurriculumDraft(await requireCurriculumPublisher(request),data);
}
export async function saveAuthoredCurriculumService(request:Request,raw:unknown){
 const data=parseCommandInput(input.save,raw);
 return saveCurriculumDraft(await requireCurriculumPublisher(request),data);
}
export async function saveAuthoredLessonService(request:Request,raw:unknown){
 const data=parseCommandInput(input.lesson,raw);
 return saveCurriculumLesson(await requireCurriculumPublisher(request),data);
}
export async function publishAuthoredCurriculumService(request:Request,raw:unknown){
 const data=parseCommandInput(input.publish,raw);
 return publishCurriculumDraft(await requireCurriculumPublisher(request),data);
}
