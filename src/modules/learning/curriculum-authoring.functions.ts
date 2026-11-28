import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as input from "./curriculum-authoring.inputs";
import * as service from "./curriculum-authoring-http.server";
export const getCurriculumPrograms=createServerFn({method:"GET"})
 
 .handler(async()=>{setResponseHeader("Cache-Control","private, no-store");return service.getCurriculumProgramsService(getRequest(),{});});

export const getCurriculumStudio=createServerFn({method:"GET"})
 .validator((raw:unknown)=>input.program.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.getCurriculumStudioService(getRequest(),data);});

export const createAuthoredCourse=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.create.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.createAuthoredCourseService(getRequest(),data);});

export const startCurriculumDraft=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.draft.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.startCurriculumDraftService(getRequest(),data);});

export const saveAuthoredCurriculum=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.save.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.saveAuthoredCurriculumService(getRequest(),data);});

export const saveAuthoredLesson=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.lesson.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.saveAuthoredLessonService(getRequest(),data);});

export const publishAuthoredCurriculum=createServerFn({method:"POST"})
 .validator((raw:unknown)=>input.publish.parse(raw))
 .handler(async({data})=>{setResponseHeader("Cache-Control","private, no-store");return service.publishAuthoredCurriculumService(getRequest(),data);});
