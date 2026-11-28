import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getNativeClassTeacherHomeworkService,getNativeClassTeacherHomeworkInput,getNativeClassTeacherMissingWorkService,getNativeClassTeacherMissingWorkInput,getNativeClassTeacherOpenFollowUpsService,getNativeClassTeacherOpenFollowUpsInput,createNativeClassMissingWorkFollowUpService,createNativeClassMissingWorkFollowUpInput,getNativeClassTeacherHomeworkHistoryService,getNativeClassTeacherHomeworkHistoryInput,returnNativeClassPracticeFeedbackService,returnNativeClassPracticeFeedbackInput,getNativeClassTeacherAssessmentsService,getNativeClassTeacherAssessmentsInput,getNativeClassTeacherHistoricalWorkService,getNativeClassTeacherHistoricalWorkInput} from "./native-class-teacher-homework.server";
export const getNativeClassTeacherHomework=createServerFn({method:"GET"}).validator((raw:unknown)=>getNativeClassTeacherHomeworkInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getNativeClassTeacherHomeworkService(getRequest(),data);
});
export const getNativeClassTeacherMissingWork=createServerFn({method:"GET"}).validator((raw:unknown)=>getNativeClassTeacherMissingWorkInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getNativeClassTeacherMissingWorkService(getRequest(),data);
});
export const getNativeClassTeacherOpenFollowUps=createServerFn({method:"GET"}).validator((raw:unknown)=>getNativeClassTeacherOpenFollowUpsInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getNativeClassTeacherOpenFollowUpsService(getRequest(),data);
});
export const createNativeClassMissingWorkFollowUp=createServerFn({method:"POST"}).validator((raw:unknown)=>createNativeClassMissingWorkFollowUpInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return createNativeClassMissingWorkFollowUpService(getRequest(),data);
});
export const getNativeClassTeacherHomeworkHistory=createServerFn({method:"GET"}).validator((raw:unknown)=>getNativeClassTeacherHomeworkHistoryInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getNativeClassTeacherHomeworkHistoryService(getRequest(),data);
});
export const returnNativeClassPracticeFeedback=createServerFn({method:"POST"}).validator((raw:unknown)=>returnNativeClassPracticeFeedbackInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return returnNativeClassPracticeFeedbackService(getRequest(),data);
});
export const getNativeClassTeacherAssessments=createServerFn({method:"GET"}).validator((raw:unknown)=>getNativeClassTeacherAssessmentsInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getNativeClassTeacherAssessmentsService(getRequest(),data);
});
export const getNativeClassTeacherHistoricalWork=createServerFn({method:"GET"}).validator((raw:unknown)=>getNativeClassTeacherHistoricalWorkInput.parse(raw)).handler(async({data})=>{
 setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");
 return getNativeClassTeacherHistoricalWorkService(getRequest(),data);
});
