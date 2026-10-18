import { createHash, createHmac } from "node:crypto";

const sha = (value: string) => createHash("sha256").update(value).digest("hex");
const hmac = (key: Buffer | string, value: string) => createHmac("sha256", key).update(value).digest();
const escapeKey = (key: string) => key.split("/").map(encodeURIComponent).join("/");

/** Cloudflare R2 credentials resolved from the environment; never exposed to clients. */
export interface R2Config {
  account: string;
  bucket: string;
  accessKey: string;
  secret: string;
}

/** Resolve the private bucket connection, failing closed on missing or malformed configuration. */
export function resolveR2Config(): R2Config {
  const { CAN_R2_ACCOUNT_ID: account, CAN_R2_BUCKET: bucket, CAN_R2_ACCESS_KEY_ID: accessKey, CAN_R2_SECRET_ACCESS_KEY: secret } = process.env;
  if (!account || !/^[a-f0-9]{32}$/.test(account) || !bucket || !/^[a-z0-9][a-z0-9.-]{2,62}$/.test(bucket) || !accessKey || !secret) {
    throw new Error("Private R2 storage is not configured");
  }
  return { account, bucket, accessKey, secret };
}

export interface SignPrivateObjectOptions {
  method: "PUT" | "HEAD" | "GET";
  key: string;
  /** Domain key policy; signing is refused unless the key matches. */
  keyPattern: RegExp;
  contentType?: string;
  expiresSeconds?: number;
}

/** Short-lived one-object SigV4 URL; credentials never leave the server. */
export function signPrivateObjectUrl({ method, key, keyPattern, contentType, expiresSeconds = 180 }: SignPrivateObjectOptions): string {
  if (!Number.isInteger(expiresSeconds) || expiresSeconds < 1 || expiresSeconds > 900 || !keyPattern.test(key)) throw new Error("Invalid R2 signing request");
  const cfg = resolveR2Config();
  const now = new Date();
  const stamp = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = stamp.slice(0, 8);
  const host = cfg.account + ".r2.cloudflarestorage.com";
  const scope = day + "/auto/s3/aws4_request";
  const path = "/" + cfg.bucket + "/" + escapeKey(key);
  const signedHeaders = contentType ? "content-type;host" : "host";
  const headers = contentType ? "content-type:" + contentType + "\nhost:" + host + "\n" : "host:" + host + "\n";
  const params = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": cfg.accessKey + "/" + scope,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": String(expiresSeconds),
    "X-Amz-SignedHeaders": signedHeaders,
  });
  params.sort();
  const query = params.toString().replace(/\+/g, "%20").replace(/%7E/gi, "~");
  const canonical = [method, path, query, headers, signedHeaders, "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, sha(canonical)].join("\n");
  const kDate = hmac("AWS4" + cfg.secret, day);
  const kRegion = hmac(kDate, "auto");
  const kService = hmac(kRegion, "s3");
  const kSign = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSign).update(stringToSign).digest("hex");
  return "https://" + host + path + "?" + query + "&X-Amz-Signature=" + signature;
}

export interface CreatePrivateUploadUrlOptions {
  key: string;
  keyPattern: RegExp;
  contentType: string;
  /** Declared upload size; rejected when outside the caller-supplied bounds. */
  contentLength?: number;
  minContentLength?: number;
  maxContentLength?: number;
  expiresSeconds?: number;
}

/** Presigned PUT URL for one private object upload; size and type bounds arrive as parameters. */
export function createPrivateUploadUrl({ key, keyPattern, contentType, contentLength, minContentLength, maxContentLength, expiresSeconds }: CreatePrivateUploadUrlOptions): string {
  if (contentLength !== undefined && (!Number.isSafeInteger(contentLength)
    || (minContentLength !== undefined && contentLength < minContentLength)
    || (maxContentLength !== undefined && contentLength > maxContentLength))) {
    throw new Error("Invalid R2 signing request");
  }
  return signPrivateObjectUrl({ method: "PUT", key, keyPattern, contentType, expiresSeconds });
}

export interface VerifyPrivateObjectOptions {
  key: string;
  keyPattern: RegExp;
  expectedSize: number;
  expectedContentType?: string;
  /** Magic-byte check for the declared type; the bounded 16-byte range read runs only when provided. */
  verifySignature?: (contentType: string, bytes: Uint8Array) => boolean;
}

/** Confirm a private object was actually uploaded and matches its declared size, type and signature. */
export async function verifyPrivateObject({ key, keyPattern, expectedSize, expectedContentType, verifySignature }: VerifyPrivateObjectOptions): Promise<void> {
  if (!keyPattern.test(key) || !Number.isSafeInteger(expectedSize) || expectedSize < 1) {
    throw new Error("Invalid private object verification request");
  }
  const head = await fetch(signPrivateObjectUrl({ method: "HEAD", key, keyPattern, expiresSeconds: 30 }), { method: "HEAD" });
  if (!head.ok) throw new Error("Private object upload could not be verified");
  if (Number(head.headers.get("content-length")) !== expectedSize) {
    throw new Error("Uploaded object size does not match the expected size");
  }
  if (expectedContentType !== undefined) {
    const actualType = head.headers.get("content-type");
    if (actualType?.split(";")[0]?.toLowerCase() !== expectedContentType.toLowerCase()) {
      throw new Error("Uploaded object type does not match the expected format");
    }
  }
  if (!verifySignature || expectedContentType === undefined) return;
  if (expectedSize < 16) throw new Error("Uploaded object is smaller than the signature sample");
  const sample = await fetch(signPrivateObjectUrl({ method: "GET", key, keyPattern, expiresSeconds: 30 }), {
    headers: { Range: "bytes=0-15" },
  });
  if (sample.status !== 206 || sample.headers.get("content-range") !== `bytes 0-15/${expectedSize}`) {
    throw new Error("Storage did not honor the bounded signature request");
  }
  const sampleLength = sample.headers.get("content-length");
  if (sampleLength !== null && Number(sampleLength) !== 16) {
    throw new Error("Storage did not honor the bounded signature request");
  }
  // Never consume a response body of unknown size: an intermediary may ignore Range.
  const reader = sample.body?.getReader();
  if (!reader) throw new Error("Private object signature response has no body");
  const bytes = new Uint8Array(16);
  let offset = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (offset + value.length > 16) throw new Error("Private object signature response exceeded 16 bytes");
      bytes.set(value, offset);
      offset += value.length;
    }
  } finally {
    await reader.cancel();
    reader.releaseLock();
  }
  if (offset !== 16 || !verifySignature(expectedContentType, bytes)) {
    throw new Error("File signature does not match the declared format");
  }
}
