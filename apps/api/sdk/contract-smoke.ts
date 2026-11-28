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

import {createEngagementApi} from './engagement-api';
export async function checkEngagementContract(client:BecomunaBrowserApi,id:string){
 const api=createEngagementApi(client);
 const links=await api.listSiteGoLinksPage({data:{siteId:id,limit:20}});
 const cursor:string|null=links.nextCursor;void cursor;
 await api.createSiteGoLink({data:{siteId:id,requestId:id,destination:{kind:'information',journeyId:'start-a-school'}}});
 await api.listOwnerEngagementDefinitions({data:{owner:{kind:'organization',organizationId:id}}});
 await api.readSenderAdministration({data:{organizationId:null}});
 await api.saveSiteMarketingPackageV61({data:{siteId:id,packageId:id,expectedRevision:1,title:'Pilot',content:{purpose:'site-announcement',audiences:['families'],geography:'',headline:'Pilot',message:'Pilot invitation',callToAction:'Register',formats:['email']}}});
 // @ts-expect-error new Go Link requires stable request identity
 await api.createSiteGoLink({data:{siteId:id,destination:{kind:'information',journeyId:'start-a-school'}}});
 // @ts-expect-error a preview snapshot cannot be issued through generic Go Link creation
 await api.createSiteGoLink({data:{siteId:id,requestId:id,destination:{kind:'website-preview',snapshotId:id,snapshotDigest:'x',sourceRevision:1,brandVersionId:id}}});
 // @ts-expect-error organization owner requires an exact organization
 await api.listOwnerEngagementDefinitions({data:{owner:{kind:'organization'}}});
 // @ts-expect-error marketing updates require expected revision
 await api.deleteSiteMarketingPackageV61({data:{siteId:id,packageId:id}});
}
