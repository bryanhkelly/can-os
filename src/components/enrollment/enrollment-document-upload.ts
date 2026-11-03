import { familyRequirementKey } from "@/components/admissions/family-document-state";
import { queryOptions } from "@tanstack/react-query";
import { beginEnrollmentDocumentUpload, finishEnrollmentDocumentUpload, getEnrollmentDocumentUploadAvailability } from "@/modules/enrollment/r2-document-upload.functions";
import { createPrivateUploadTask, documentUploadPolicy } from "@/platform/storage/private-upload";

export function enrollmentDocumentUploadAvailabilityQuery() {
  return queryOptions({
    queryKey: ["enrollment-document-upload-availability"],
    queryFn: () => getEnrollmentDocumentUploadAvailability(),
    retry: false,
    gcTime: 0,
  });
}

export function createEnrollmentDocumentUploads() {
  const pending = new Map<string, { file: File; task: { run: () => Promise<unknown> } }>();
  return {
    async upload(applicationId: string, requirementId: string, file: File): Promise<void> {
      const identity = familyRequirementKey(applicationId, requirementId);
      let attempt = pending.get(identity);
      if (attempt?.file !== file) {
        const request = { applicationId, requirementId, fileName: file.name, mimeType: file.type, size: file.size };
        attempt = {
          file,
          task: createPrivateUploadTask({
            file, policy: documentUploadPolicy,
            begin: () => beginEnrollmentDocumentUpload({ data: request }),
            finish: upload => finishEnrollmentDocumentUpload({ data: { ...request, key: upload.key } }),
          }),
        };
        pending.set(identity, attempt);
      }
      await attempt.task.run();
      if (pending.get(identity) === attempt) pending.delete(identity);
    },
  };
}
