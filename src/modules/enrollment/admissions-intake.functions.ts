import {createServerFn,createServerOnlyFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import * as intake from "./admissions-intake.server";
export const registrar=createServerOnlyFn(async()=>intake.requireAdmissionsRegistrar(getRequest()));
function privateResponse(){setResponseHeader("Cache-Control","private, no-store");setResponseHeader("Referrer-Policy","no-referrer");}
export const listAdmissionsIntakePrograms=createServerFn({method:"GET"}).handler(async()=>{
 privateResponse();return intake.listAdmissionsIntakeProgramsService(getRequest());
});
export const listAdmissionsExistingStudentsPage=createServerFn({method:"GET"}).validator((raw:unknown)=>intake.listAdmissionsExistingStudentsPageInput.parse(raw??{})).handler(async({data})=>{
 privateResponse();return intake.listAdmissionsExistingStudentsPageService(getRequest(),data);
});
export const getAdmissionsStageCounts=createServerFn({method:"GET"}).validator((raw:unknown)=>intake.getAdmissionsStageCountsInput.parse(raw??{})).handler(async({data})=>{
 privateResponse();return intake.getAdmissionsStageCountsService(getRequest(),data);
});
export const searchAdmissionsHouseholds=createServerFn({method:"GET"}).validator((raw:unknown)=>intake.searchAdmissionsHouseholdsInput.parse(raw??{})).handler(async({data})=>{
 privateResponse();return intake.searchAdmissionsHouseholdsService(getRequest(),data);
});
export const listAdmissionsIntake=createServerFn({method:"GET"}).validator((raw:unknown)=>intake.listAdmissionsIntakeInput.parse(raw??{})).handler(async({data})=>{
 privateResponse();return intake.listAdmissionsIntakeService(getRequest(),data);
});
export const createAdmissionsInquiry=createServerFn({method:"POST"}).validator((raw:unknown)=>intake.createAdmissionsInquiryInput.parse(raw)).handler(async({data})=>{
 privateResponse();return intake.createAdmissionsInquiryService(getRequest(),data);
});
export const transitionAdmissionsStage=createServerFn({method:"POST"}).validator((raw:unknown)=>intake.transitionAdmissionsStageInput.parse(raw)).handler(async({data})=>{
 privateResponse();return intake.transitionAdmissionsStageService(getRequest(),data);
});
export const provisionInquiryGuardianAccount=createServerFn({method:"POST"}).validator((raw:unknown)=>intake.provisionInquiryGuardianAccountInput.parse(raw)).handler(async({data})=>{
 privateResponse();return intake.provisionInquiryGuardianAccountService(getRequest(),data);
});
export const sendAdmissionsGuardianInvitation=createServerFn({method:"POST"}).validator((raw:unknown)=>intake.sendAdmissionsGuardianInvitationInput.parse(raw)).handler(async({data})=>{
 privateResponse();return intake.sendAdmissionsGuardianInvitationService(getRequest(),data);
});
export const verifyAdmissionsGuardianRelationship=createServerFn({method:"POST"}).validator((raw:unknown)=>intake.verifyAdmissionsGuardianRelationshipInput.parse(raw)).handler(async({data})=>{
 privateResponse();return intake.verifyAdmissionsGuardianRelationshipService(getRequest(),data);
});
export const listAdmissionsExistingStudents=listAdmissionsExistingStudentsPage;
