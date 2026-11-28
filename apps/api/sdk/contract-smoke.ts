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

export async function checkOwnerControlContract(client:BecomunaBrowserApi,grantId:string){
 const status=await client.GET('/api/v1/owner/delegation');
 if(status.data){const active:boolean=status.data.active;void active;}
 await client.GET('/api/v1/owner/delegation-targets',{params:{query:{search:'example'}}});
 await client.POST('/api/v1/owner/delegation',{body:{grantId,mode:'view',reason:'Reviewed support request'}});
 await client.POST('/api/v1/owner/delegation/return',{body:{confirm:true}});
 // @ts-expect-error cannot select an effective account or arbitrary role
 await client.POST('/api/v1/owner/delegation',{body:{grantId,mode:'view',reason:'Reviewed support request',role:'platform_owner'}});
 // @ts-expect-error explicit confirmation required
 await client.POST('/api/v1/owner/delegation/return',{body:{}});
}

export async function checkStaffAdministrationContract(client:BecomunaBrowserApi,siteId:string,grantId:string){
 await client.GET('/api/v1/staff/sites');
 await client.GET('/api/v1/staff/people',{params:{query:{query:'teacher'}}});
 await client.GET('/api/v1/staff/accounts');
 await client.POST('/api/v1/staff/invitations',{body:{email:'teacher@example.test',firstName:'Test',lastName:'Teacher',role:'teacher',siteId}});
 await client.POST('/api/v1/staff/grant-state',{body:{grantId,active:false}});
 // @ts-expect-error staff invitations cannot grant owner roles
 await client.POST('/api/v1/staff/invitations',{body:{email:'teacher@example.test',firstName:'Test',lastName:'Teacher',role:'platform_owner',siteId}});
 // @ts-expect-error no caller-selected actor
 await client.POST('/api/v1/staff/grant-state',{body:{grantId,active:false,actorId:grantId}});
}
