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
