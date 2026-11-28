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

export async function checkWorkApprovalContract(client:BecomunaBrowserApi,id:string){
 const queue=await client.GET('/api/v1/operations/actions',{params:{query:{siteId:id}}});
 if(queue.data){const count:number=queue.data.summary.overdue;void count;}
 await client.GET('/api/v1/actions/{actionId}',{params:{path:{actionId:id}}});
 await client.POST('/api/v1/operations/actions/{id}/assignment',{params:{path:{id}},body:{ownerPersonId:null,priority:'urgent'}});
 await client.POST('/api/v1/operations/actions/{id}/deadline',{params:{path:{id}},body:{dueAt:null,reason:'Schedule revised'}});
 await client.POST('/api/v1/credential-issuer-approvals/{approvalId}/decisions',{params:{path:{approvalId:id}},body:{decision:'reject',evidenceReference:'Independent evidence reference'}});
 // @ts-expect-error actor identity cannot be supplied
 await client.POST('/api/v1/operations/actions/{id}/assignment',{params:{path:{id}},body:{ownerPersonId:id,priority:'urgent',actorPersonId:id}});
 // @ts-expect-error independent decision evidence is required
 await client.POST('/api/v1/credential-issuer-approvals/{approvalId}/decisions',{params:{path:{approvalId:id}},body:{decision:'reject'}});
}

export async function checkJurisdictionContract(client:BecomunaBrowserApi,id:string){
 const reviews=await client.GET('/api/v1/jurisdiction-profiles/reviews');
 if(reviews.data){const canVerify:boolean|undefined=reviews.data[0]?.canVerify;void canVerify;}
 await client.GET('/api/v1/jurisdiction-profiles/guidance');
 await client.POST('/api/v1/jurisdiction-profiles/{id}/verification',{params:{path:{id}},body:{note:'Independent source review completed'}});
 await client.POST('/api/v1/jurisdiction-profiles/{id}/publication',{params:{path:{id}},body:{}});
 // @ts-expect-error independent evidence note is required
 await client.POST('/api/v1/jurisdiction-profiles/{id}/verification',{params:{path:{id}},body:{}});
}
