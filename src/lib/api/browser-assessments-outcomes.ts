import {createBrowserApiClient,type paths} from "../../../apps/api/sdk/client";
import {requireApiData} from "./api-response";
type Body<P extends keyof paths> = paths[P] extends {post:{requestBody:{content:{"application/json":infer B}}}} ? B : never;
type Phase="baseline"|"final";
export async function getNoncreditKnowledgeCheck(courseAttemptId:string,phase:Phase,signal?:AbortSignal){
 return requireApiData(await createBrowserApiClient().GET("/api/v1/knowledge-check",{params:{query:{courseAttemptId,phase}},signal}));
}
export async function beginNoncreditKnowledgeCheckAttempt(body:Body<"/api/v1/knowledge-check-attempts">){
 return requireApiData(await createBrowserApiClient().POST("/api/v1/knowledge-check-attempts",{body}));
}
export async function saveNoncreditKnowledgeCheckAnswer(body:Body<"/api/v1/knowledge-check-draft-answers">){
 return requireApiData(await createBrowserApiClient().POST("/api/v1/knowledge-check-draft-answers",{body}));
}
export async function submitNoncreditKnowledgeCheckAnswers(body:Body<"/api/v1/knowledge-check-submissions">){
 return requireApiData(await createBrowserApiClient().POST("/api/v1/knowledge-check-submissions",{body}));
}
export async function getCanonicalCourseEvidence(courseAttemptId:string,signal?:AbortSignal){
 return requireApiData(await createBrowserApiClient().GET("/api/v1/me/course-evidence",{params:{query:{courseAttemptId}},signal}));
}

export async function getNativeClassPendingKnowledgeReviews(classId:string,signal?:AbortSignal){
 return requireApiData(await createBrowserApiClient().GET("/api/v1/class-knowledge-review-queue",{params:{query:{classId}},signal}));
}
export async function getNativeClassCanonicalEvidence(classEnrollmentId:string,signal?:AbortSignal){
 return requireApiData(await createBrowserApiClient().GET("/api/v1/me/class-completion-evidence",{params:{query:{classEnrollmentId}},signal}));
}
export async function listMyNoncreditCredentials(signal?:AbortSignal){
 return requireApiData(await createBrowserApiClient().GET("/api/v1/me/credentials",{signal}));
}
export async function getPendingCompletionEvidenceReviews(page:number,signal?:AbortSignal){
 return requireApiData(await createBrowserApiClient().GET("/api/v1/completion-evidence-review-queue",{params:{query:{page}},signal}));
}
export async function getNativeClassCompletionQueue(classId:string,page:number,signal?:AbortSignal){
 return requireApiData(await createBrowserApiClient().GET("/api/v1/class-completion-queue",{params:{query:{classId,page}},signal}));
}
export async function getNativeClassCompletionReview(classEnrollmentId:string,signal?:AbortSignal){
 return requireApiData(await createBrowserApiClient().GET("/api/v1/class-completion-review",{params:{query:{classEnrollmentId}},signal}));
}
export async function finalizeNativeClassKnowledgeCheck(body:Body<"/api/v1/class-knowledge-check-finalizations">){
 return requireApiData(await createBrowserApiClient().POST("/api/v1/class-knowledge-check-finalizations",{body}));
}
export async function downloadMyNoncreditCredential(body:Body<"/api/v1/me/credential-downloads">){
 return requireApiData(await createBrowserApiClient().POST("/api/v1/me/credential-downloads",{body}));
}
export async function previewNoncreditCredential(body:Body<"/api/v1/credential-previews">){
 return requireApiData(await createBrowserApiClient().POST("/api/v1/credential-previews",{body}));
}
export async function decideCompletionEvidenceReview(body:Body<"/api/v1/completion-evidence-review-decisions">){
 return requireApiData(await createBrowserApiClient().POST("/api/v1/completion-evidence-review-decisions",{body}));
}
export async function requestCompletionEvidenceReview(body:Body<"/api/v1/completion-evidence-review-requests">){
 return requireApiData(await createBrowserApiClient().POST("/api/v1/completion-evidence-review-requests",{body}));
}
export async function revokeLearningAwardIssuance(body:Body<"/api/v1/credential-revocations">){
 return requireApiData(await createBrowserApiClient().POST("/api/v1/credential-revocations",{body}));
}
export async function decideNativeClassCompletion(body:Body<"/api/v1/class-completion-decisions">){
 return requireApiData(await createBrowserApiClient().POST("/api/v1/class-completion-decisions",{body}));
}
export async function publishNativeClassCompletionPolicy(body:Body<"/api/v1/class-completion-policies">){
 return requireApiData(await createBrowserApiClient().POST("/api/v1/class-completion-policies",{body}));
}
