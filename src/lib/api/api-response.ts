import { normalizeClientError } from "@/lib/client-error";
import { clientErrorMessages, type ClientErrorCode } from "@/domain/errors";

/** Trust the HTTP status, never a remote title/detail or raw error message. */
export class ApiResponseError extends Error {
  readonly code: ClientErrorCode;
  readonly status: number;
  constructor(status: number) {
    const code: ClientErrorCode =
      status === 401 ? "AUTHENTICATION_REQUIRED" :
      status === 403 ? "FORBIDDEN" :
      [400, 413, 415, 422].includes(status) ? "VALIDATION_FAILED" :
      status === 409 ? "CONFLICT" :
      [429, 502, 503, 504].includes(status) ? "UNAVAILABLE" : "UNEXPECTED";
    super(clientErrorMessages[code]);
    this.name = "ApiResponseError";
    this.code = code;
    this.status = status;
  }
}

export function requireApiStatus(response: Response, expected: number): void {
  if (response.status !== expected) throw new ApiResponseError(response.status);
}

export function requireApiData<T>(result: { response: Response; data?: T }): T {
  if (!result.response.ok) throw new ApiResponseError(result.response.status);
  if (result.data === undefined || result.data === null) throw new ApiResponseError(500);
  return result.data;
}

/** Transport/parse failures are not proof that authentication has expired. */
export function apiClientError(error: unknown) {
  return normalizeClientError(error instanceof ApiResponseError ? error : new ApiResponseError(503));
}
