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

export async function checkReportingContract(client:BecomunaBrowserApi){
 const readiness=await client.GET('/api/v1/reports/network-readiness');
 if(readiness.data){const classification:'private_setup_inventory'=readiness.data.classification;void classification;}
 await client.GET('/api/v1/reports/geography-options',{params:{query:{basis:'historical'}}});
 await client.GET('/api/v1/reports/site-options');
 await client.GET('/api/v1/reporting-relationship-recipients',{params:{query:{query:'school'}}});
 await client.GET('/api/v1/reporting-relationship-scopes',{params:{query:{kind:'site'}}});
 await client.GET('/api/v1/reporting-relationships',{params:{query:{direction:'incoming'}}});
 // @ts-expect-error invalid geography basis
 await client.GET('/api/v1/reports/geography-options',{params:{query:{basis:'any'}}});
}

export async function checkReportingEvidenceContract(client:BecomunaBrowserApi,siteId:string,snapshotId:string,from:string,to:string){
 await client.GET('/api/v1/reports/metric-definitions');
 await client.GET('/api/v1/reports/projection-health');
 await client.GET('/api/v1/sites/{siteId}/reports/source-coverage',{params:{path:{siteId},query:{from,to}}});
 await client.GET('/api/v1/sites/{siteId}/reports/campaign-delivery',{params:{path:{siteId},query:{from,to}}});
 const snapshot=await client.GET('/api/v1/reporting-source-snapshots/{snapshotId}',{params:{path:{snapshotId}}});
 if(snapshot.data){const completeness:false=snapshot.data.lifecycleCompletenessVerified;void completeness;}
}
