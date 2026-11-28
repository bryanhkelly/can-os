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

export async function checkAdmissionsIntakeContract(client:BecomunaBrowserApi,id:string){
 await client.GET('/api/v1/admission-intake-programs');
 await client.GET('/api/v1/admission-existing-students',{params:{query:{programId:id,page:1,pageSize:40}}});
 await client.GET('/api/v1/admission-stage-counts',{params:{query:{programId:id}}});
 await client.GET('/api/v1/admission-household-search',{params:{query:{programId:id,search:'Example'}}});
 await client.GET('/api/v1/admission-applications',{params:{query:{applicationId:id}}});
 await client.POST('/api/v1/admission-inquiries',{body:{requestId:id,programId:id,existingStudent:{studentProfileId:id,guardianPersonId:id,householdId:id}}});
 await client.POST('/api/v1/admission-stage-transitions',{body:{applicationId:id,decision:'application'}});
 await client.POST('/api/v1/admission-guardian-verifications',{body:{applicationId:id,method:'in_person_id',evidenceNote:'Independent identity verification'}});
 await client.POST('/api/v1/admission-guardian-accounts',{body:{applicationId:id}});
 await client.POST('/api/v1/admission-guardian-invitations',{body:{applicationId:id}});
 // @ts-expect-error the guardian is derived from the application, never selected by client
 await client.POST('/api/v1/admission-guardian-accounts',{body:{applicationId:id,guardianPersonId:id}});
}

export async function checkFamilyApplicationContract(client:BecomunaBrowserApi,id:string){
 await client.GET('/api/v1/me/family-application-workspace');
 await client.POST('/api/v1/family-applications',{body:{requestId:id,programId:id,studentFirstName:'Student',studentLastName:'Example',gradeLevel:'6'}});
 await client.POST('/api/v1/admission-guardian-access-revocations',{body:{grantId:id,reason:'Verified authorization change'}});
 await client.POST('/api/v1/admission-guardian-access-restorations',{body:{grantId:id,reason:'Verified authorization change'}});
 // @ts-expect-error restoration must never reactivate revoked sessions
 await client.POST('/api/v1/admission-guardian-access-restorations',{body:{grantId:id,reason:'Verified authorization change',restoreSessions:true}});
}
