import { createBrowserApiClient } from "../../../apps/api/sdk/client";
import { requireApiData } from "./api-response";

export async function completeLearnerLesson(classEnrollmentId: string, lessonId: string) {
  return requireApiData(await createBrowserApiClient().POST("/api/v1/me/class-enrollments/{classEnrollmentId}/lessons/{lessonId}/completion", {
    params: { path: { classEnrollmentId, lessonId } }, body: {},
  }));
}

export async function submitLearnerAssignment(classEnrollmentId: string, assignmentId: string, responseText: string) {
  return requireApiData(await createBrowserApiClient().POST("/api/v1/me/class-enrollments/{classEnrollmentId}/assignments/{assignmentId}/submission", {
    params: { path: { classEnrollmentId, assignmentId } }, body: { responseText },
  }));
}

export async function readLearnerClasses(signal?: AbortSignal) {
  return requireApiData(await createBrowserApiClient().GET("/api/v1/me/student/classes", { signal }));
}

export async function readLearnerResume(classEnrollmentId: string, signal?: AbortSignal) {
  return requireApiData(await createBrowserApiClient().GET("/api/v1/me/class-enrollments/{classEnrollmentId}/resume", {
    params: { path: { classEnrollmentId } }, signal,
  }));
}

export async function readLearnerAssignments(classEnrollmentId: string, signal?: AbortSignal) {
  return requireApiData(await createBrowserApiClient().GET("/api/v1/me/class-enrollments/{classEnrollmentId}/assignments", {
    params: { path: { classEnrollmentId } }, signal,
  }));
}
