import { randomUUID } from "node:crypto";
import { assertPrivateUploadCors } from "../src/platform/storage/private-upload.ts";
import { createPrivateUpload } from "../src/platform/storage/r2.ts";

const [origin, namespace = "live"] = process.argv.slice(2);

try {
  if (!origin) throw new Error("Usage: npm run check:r2-cors -- <application-origin> [live|demo]");
  const parsedOrigin = new URL(origin);
  if (!["http:", "https:"].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
    throw new Error("Provide an application origin without a path, query or fragment.");
  }
  if (namespace !== "live" && namespace !== "demo") {
    throw new Error("Storage namespace must be live or demo.");
  }

  const objectKey = `configuration-check/${randomUUID()}`;
  const upload = createPrivateUpload({
    key: objectKey,
    keyPattern: /^configuration-check\/[0-9a-f-]{36}$/i,
    contentType: "application/pdf",
    preventOverwrite: true,
    expiresSeconds: 60,
    namespace,
  });
  const requiredHeaders = Object.keys(upload.uploadHeaders);
  let response;
  try {
    response = await fetch(upload.uploadUrl, {
      method: "OPTIONS",
      headers: {
        Origin: origin,
        "Access-Control-Request-Method": "PUT",
        "Access-Control-Request-Headers": requiredHeaders.map(header => header.toLowerCase()).join(","),
      },
    });
  } catch {
    throw new Error("Could not reach the configured R2 endpoint for its CORS preflight.");
  }
  assertPrivateUploadCors(response, origin, requiredHeaders);
  console.log(`R2 ${namespace} CORS allows PUT from ${origin} with ${requiredHeaders.join(", ")}.`);
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : "R2 CORS configuration check failed.");
  process.exitCode = 1;
}
