import type {BecomunaBrowserApi} from './client';
// These compile-time assertions use the generated paths from the actual server.
// No network request is made by this file.
export async function checkStudentContract(client:BecomunaBrowserApi, enrollmentId:string){
 const identity=await client.GET('/api/v1/me');
 if(identity.data){const personId:string=identity.data.personId;void personId;}
 const resume=await client.GET('/api/v1/me/class-enrollments/{classEnrollmentId}/resume',{params:{path:{classEnrollmentId:enrollmentId}}});
 if(resume.data){const completed:number=resume.data.completed;void completed;}
 // Browser-owned Origin is still mandatory on the wire; the browser, not UI code, supplies it.
 await client.POST('/api/v1/me/session/membership',{body:{grantId:enrollmentId}});
 await client.POST('/api/v1/me/session/activity',{body:{}});
 // @ts-expect-error missing grantId remains a compile-time error
 await client.POST('/api/v1/me/session/membership',{body:{}});
 // @ts-expect-error unknown routes must never become an untyped escape hatch
 await client.GET('/api/v1/not-a-real-route');
 // @ts-expect-error the exact enrollment path parameter is required
 await client.GET('/api/v1/me/class-enrollments/{classEnrollmentId}/resume',{params:{path:{}}});
}

export async function checkOutcomeContract(client:BecomunaBrowserApi,id:string){
 const awards=await client.GET('/api/v1/me/credentials');
 if(awards.data){for(const award of awards.data){const current:boolean=award.current;void current;}}
 const preview=await client.POST('/api/v1/credential-previews',{body:{trainingVersionId:id,format:'pdf'}});
 if(preview.data){const artifact:string=preview.data.base64;void artifact;}
 await client.GET('/api/v1/class-completion-queue',{params:{query:{classId:id,page:0}}});
 await client.POST('/api/v1/completion-evidence-review-decisions',{body:{requestId:id,decision:'approve'}});
 // @ts-expect-error Person identity is server resolved, not caller supplied
 await client.POST('/api/v1/me/credential-downloads',{body:{issuanceId:id,format:'pdf',personId:id}});
 // @ts-expect-error issuance is intentionally not exposed until acceptance
 await client.POST('/api/v1/credential-issuances',{body:{}});
}

export async function checkNativeAssessmentContract(client:BecomunaBrowserApi,id:string){
 await client.POST('/api/v1/class-knowledge-check-access',{body:{classEnrollmentId:id}});
 await client.GET('/api/v1/class-knowledge-review-queue',{params:{query:{classId:id}}});
 await client.POST('/api/v1/class-knowledge-check-finalizations',{body:{classEnrollmentId:id,assessmentAttemptId:id}});
 const evidence=await client.GET('/api/v1/me/class-completion-evidence',{params:{query:{classEnrollmentId:id}}});
 if(evidence.data){const verified:boolean=evidence.data.classCompletionAuthorityVerified;void verified;}
 // @ts-expect-error scoring is server-authoritative
 await client.POST('/api/v1/class-knowledge-check-finalizations',{body:{classEnrollmentId:id,assessmentAttemptId:id,pointsEarned:100}});
}
