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

export async function checkManualWorkContract(client:BecomunaBrowserApi,id:string){
 const page=await client.GET('/api/v1/work/tasks',{params:{query:{siteId:id,afterId:id}}});
 if(page.data){const cursor:string|null=page.data.nextAfterId;void cursor;}
 await client.GET('/api/v1/work/inbox');
 await client.POST('/api/v1/work/tasks',{body:{requestId:id,siteId:id,title:'Prepare materials',ownerPersonId:null}});
 await client.POST('/api/v1/work/tasks/{id}/escalations',{params:{path:{id}},body:{requestId:id,expectedUpdatedAt:'2026-11-28T00:00:00Z',reason:'Immediate operational need'}});
 // @ts-expect-error cannot create a domain-specific approval using a manual task
 await client.POST('/api/v1/work/tasks',{body:{requestId:id,siteId:id,title:'Prepare materials',ownerPersonId:null,type:'credential_approval'}});
}
