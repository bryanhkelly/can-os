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
