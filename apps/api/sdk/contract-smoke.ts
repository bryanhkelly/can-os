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

export async function checkParticipationContract(client:BecomunaBrowserApi, releaseId:string,registrationId:string){
 const queue=await client.GET('/api/v1/me/noncredit-waitlist',{params:{query:{releaseId}}});
 if(queue.data){const items=queue.data.items;void items;}
 await client.POST('/api/v1/noncredit-waitlist-entries',{body:{releaseId,consentVersion:'v01',consentSha256:'a'.repeat(64),acceptedConsent:true,adultConfirmed:true}});
 await client.POST('/api/v1/noncredit-waitlist-cancellations',{body:{releaseId}});
 await client.POST('/api/v1/noncredit-registration-withdrawals',{body:{registrationId,confirm:true}});
 // @ts-expect-error withdrawal cannot be authorized using a release ID
 await client.POST('/api/v1/noncredit-registration-withdrawals',{body:{releaseId,confirm:true}});
}
