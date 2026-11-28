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

// WS03: generated browser paths must retain exact Site scoping.
export async function checkOrganizationLaunchContract(client:BecomunaBrowserApi,siteId:string){
 const params={path:{siteId}};
 const geography=await client.GET('/api/v1/sites/{siteId}/geography',{params});
 if(geography.data){const status:string=geography.data.status;void status;}
 await client.GET('/api/v1/sites/{siteId}/information',{params});
 await client.GET('/api/v1/sites/{siteId}/programs-audiences',{params});
 await client.GET('/api/v1/sites/{siteId}/publication-readiness',{params});
 // @ts-expect-error Site scope must be explicit
 await client.GET('/api/v1/sites/{siteId}/geography',{params:{path:{}}});
}

export async function checkLaunchFacilitiesContract(client:BecomunaBrowserApi,siteId:string,classId:string){
 const response=await client.GET('/api/v1/sites/{siteId}/spaces',{params:{path:{siteId}}});
 if(response.data){const revision:number|undefined=response.data.spaces[0]?.revision;void revision;}
 await client.POST('/api/v1/sites/{siteId}/classes/{classId}/physical-plan-revisions',{params:{path:{siteId,classId}},body:{spaceId:null,facilitatorAssignmentId:null,expectedRevision:1}});
 // @ts-expect-error revision is mandatory
 await client.POST('/api/v1/sites/{siteId}/classes/{classId}/physical-plan-revisions',{params:{path:{siteId,classId}},body:{spaceId:null,facilitatorAssignmentId:null}});
}

export async function checkSiteMediaContract(client:BecomunaBrowserApi,siteId:string){
 const params={path:{siteId}};
 await client.GET('/api/v1/sites/{siteId}/media',{params});
 const upload=await client.POST('/api/v1/sites/{siteId}/media-upload-intents',{params,body:{fileName:'photo.png',mimeType:'image/png',size:1000,width:320,height:240}});
 if(upload.data){const signedUrl:string=upload.data.uploadUrl;void signedUrl;}
 // @ts-expect-error rights review must explicitly confirm each file
 await client.POST('/api/v1/sites/{siteId}/media-reviews',{params,body:{documentIds:[siteId],rightsConfirmed:true,subjectRelease:'no_identifiable_people',reason:'Reviewed all files'}});
}

export async function checkNetworkAffiliationContract(client:BecomunaBrowserApi,siteId:string,affiliationId:string){
 await client.GET('/api/v1/sites/{siteId}/affiliations',{params:{path:{siteId}}});
 await client.POST('/api/v1/me/network-affiliations/{affiliationId}/decisions',{params:{path:{affiliationId}},body:{decision:'approve',reason:'Verified agreement'}});
 // @ts-expect-error caller cannot supply organization authority
 await client.POST('/api/v1/me/network-affiliations/{affiliationId}/decisions',{params:{path:{affiliationId}},body:{decision:'approve',reason:'Verified agreement',organizationId:siteId}});
}
