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

import {createCampaignApi} from './campaign-api';
export async function checkCampaignContract(client:BecomunaBrowserApi,id:string){
 const scope={engagementId:id,linkId:id};
 const campaigns=createCampaignApi(client);
 const workspace=await campaigns.readEngagementCampaignWorkspace({data:scope});
 const pending:number|undefined=workspace.campaigns[0]?.pending;void pending;
 await campaigns.queueEngagementCampaign({data:{...scope,listId:id,requestId:id,scheduledAt:new Date().toISOString(),confirmed:true}});
 // @ts-expect-error stable request ID is required
 await campaigns.queueEngagementCampaign({data:{...scope,listId:id,scheduledAt:new Date().toISOString(),confirmed:true}});
 // @ts-expect-error explicit consent attestation is required
 await campaigns.saveCampaignRecipientList({data:{...scope,name:'Pilot',raw:'test@example.test',consentSource:'Documented permission',attested:false}});
 // @ts-expect-error direct and saved-list recipients cannot be mixed
 await campaigns.queueEngagementCampaign({data:{...scope,listId:id,raw:'test@example.test',consentSource:'Documented permission',attested:true,requestId:id,scheduledAt:new Date().toISOString(),confirmed:true}});
}
