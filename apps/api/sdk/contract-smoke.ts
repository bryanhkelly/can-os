import type {BecomunaBrowserApi} from './client';
// These compile-time assertions use the generated paths from the actual server.
// No network request is made by this file.
export async function checkStudentContract(client:BecomunaBrowserApi, enrollmentId:string){
 const identity=await client.GET('/api/v1/me');
 if(identity.data){const personId:string=identity.data.personId;void personId;}
 const resume=await client.GET('/api/v1/me/class-enrollments/{classEnrollmentId}/resume',{params:{path:{classEnrollmentId:enrollmentId}}});
 if(resume.data){const completed:number=resume.data.completed;void completed;}
 const learning=await client.GET('/api/v1/me/class-enrollments/{classEnrollmentId}/learning',{params:{path:{classEnrollmentId:enrollmentId}}});
 if(learning.data){const lessonBody:string|undefined=learning.data.lessons[0]?.lessonBody;void lessonBody;}
 const assignments=await client.GET('/api/v1/me/class-enrollments/{classEnrollmentId}/assignment-workspace',{params:{path:{classEnrollmentId:enrollmentId}}});
 if(assignments.data){const response:string|undefined=assignments.data.assignments[0]?.responseText;void response;}
 const history=await client.GET('/api/v1/me/class-enrollments/{classEnrollmentId}/assignments/{assignmentId}/revisions',{params:{path:{classEnrollmentId:enrollmentId,assignmentId:enrollmentId},query:{beforeRevision:2}}});
 if(history.data){const next:number|null=history.data.nextBefore;void next;}
 const choices=await client.GET('/api/v1/me/course-attempts/{courseAttemptId}/instructors',{params:{path:{courseAttemptId:enrollmentId}}});
 if(choices.data){const revision:number|undefined=choices.data.selection?.revision;void revision;}
 await client.POST('/api/v1/me/course-attempts/{courseAttemptId}/instructor-selections',{params:{path:{courseAttemptId:enrollmentId}},body:{requestId:enrollmentId,trackVersionId:enrollmentId,expectedRevision:0}});
 // @ts-expect-error optimistic concurrency revision must be supplied
 await client.POST('/api/v1/me/course-attempts/{courseAttemptId}/instructor-selections',{params:{path:{courseAttemptId:enrollmentId}},body:{requestId:enrollmentId,trackVersionId:enrollmentId}});
 const host=await client.GET('/api/v1/classrooms/{facilitatedSessionId}/host-activity',{params:{path:{facilitatedSessionId:enrollmentId}}});
 if(host.data){const paired:number=host.data.pairedCount;void paired;}
 const rehearsal=await client.GET('/api/v1/classroom-rehearsal/choices');
 if(rehearsal.data){const partial:boolean=rehearsal.data.partial;void partial;}
 const workspace=await client.GET('/api/v1/classes/{classId}/workspace',{params:{path:{classId:enrollmentId},query:{view:'learn'}}});
 if(workspace.data){const control:boolean=workspace.data.canControlRoom;void control;}
 const participation=await client.GET('/api/v1/me/course-attempts/{courseAttemptId}/participation-kind',{params:{path:{courseAttemptId:enrollmentId}}});
 if(participation.data){const baseline:boolean=participation.data.hasBaseline;void baseline;}
 const feedback=await client.GET('/api/v1/me/course-attempts/{courseAttemptId}/classroom-feedback',{params:{path:{courseAttemptId:enrollmentId}}});
 if(feedback.data){const rating:number|undefined=feedback.data.rooms[0]?.ratings.clarity;void rating;}
 const practice=await client.GET('/api/v1/me/course-attempts/{courseAttemptId}/practice-history',{params:{path:{courseAttemptId:enrollmentId}}});
 if(practice.data?.nextBeforeId){
  const page=await client.GET('/api/v1/me/course-attempts/{courseAttemptId}/practice-history',{params:{path:{courseAttemptId:enrollmentId},query:{beforeId:practice.data.nextBeforeId}}});
  if(page.data){const responses=page.data.items[0]?.answers;void responses;}
 }
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
