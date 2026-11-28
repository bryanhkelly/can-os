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

export async function checkAdmissionsContract(client:BecomunaBrowserApi, applicationId:string,schoolYearId:string,offerId:string,classEnrollmentId:string){
 await client.GET('/api/v1/admission-offer-options',{params:{query:{applicationId}}});
 await client.POST('/api/v1/admission-offers',{body:{applicationId,schoolYearId}});
 const response=await client.POST('/api/v1/admission-offer-responses',{body:{offerId,decision:'accept'}});
 if(response.data){const acceptedOfferId:string=response.data.offerId;void acceptedOfferId;}
 await client.POST('/api/v1/admission-enrollment-activations',{body:{offerId}});
 await client.POST('/api/v1/admission-offer-withdrawals',{body:{offerId,reason:'Offer no longer available',confirmed:true}});
 await client.POST('/api/v1/class-enrollment-withdrawals',{body:{classEnrollmentId}});
 await client.POST('/api/v1/class-enrollment-cancellations',{body:{classEnrollmentId,reason:'operator_decision'}});
 // @ts-expect-error acceptance never returns a newly activated enrollment
 if(response.data){const enrollmentId=response.data.enrollmentId;void enrollmentId;}
}

export async function checkClassParticipationContract(client:BecomunaBrowserApi,id:string){
 await client.POST('/api/v1/class-approval-requests',{body:{classOfferingVersionId:id,requestId:id}});
 await client.POST('/api/v1/class-approval-decisions',{body:{approvalRequestId:id,decision:'approved',reason:'eligible'}});
 await client.GET('/api/v1/me/class-approvals');
 await client.GET('/api/v1/class-approval-queue',{params:{query:{classId:id}}});
 await client.POST('/api/v1/class-invitations',{body:{classOfferingVersionId:id,learnerPersonId:id,requestId:id,creditMode:'audit'}});
 await client.GET('/api/v1/me/class-invitations');
 await client.POST('/api/v1/class-invitation-declines',{body:{invitationId:id}});
 await client.POST('/api/v1/class-enrollment-assignments',{body:{classId:id,learnerPersonId:id,creditMode:'audit'}});
 // @ts-expect-error approval requests cannot specify a different learner
 await client.POST('/api/v1/class-approval-requests',{body:{classOfferingVersionId:id,requestId:id,learnerPersonId:id}});
}
