import { publicSiteHost, slugFromPublicSiteHost } from "@/domain/public-site-address";

const MAX_HTML_BYTES = 1_000_000;

/** Stop reading immediately once the response exceeds the acceptance limit. */
async function readBoundedHtml(response: Response): Promise<string | null> {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_HTML_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export type PublicHostAvailability = "not_published" | "hosting_disabled" | "live" | "unreachable";
export type PublicHostCheck = {
  status: PublicHostAvailability;
  url: string | null;
  checkedAt: string | null;
  diagnostic: string;
};

/** Network evidence, not DNS provisioning or a claim of academic authorization. */
export async function checkPublishedSiteReachability(input: {
  host: string | null;
  published: boolean;
  hostingConfigured: boolean;
  fetcher?: typeof fetch;
}): Promise<PublicHostCheck> {
  if (!input.published || !input.host) {
    return { status: "not_published", url: null, checkedAt: null,
      diagnostic: "Publish the site before checking its public address." };
  }
  // Fail closed: never fetch an arbitrary host from a request, DB mutation, or preview.
  const slug = slugFromPublicSiteHost(input.host);
  if (!slug || publicSiteHost(slug) !== input.host) {
    return { status: "unreachable", url: null, checkedAt: null,
      diagnostic: "The reserved Site hostname is invalid." };
  }
  const url = `https://${input.host}/`;
  if (!input.hostingConfigured) {
    return { status: "hosting_disabled", url, checkedAt: null,
      diagnostic: "Public tenant hosting is disabled. Configure wildcard DNS, TLS and the Netlify edge rollout flag." };
  }
  const checkedAt = new Date().toISOString();
  try {
    const response = await (input.fetcher ?? fetch)(url, {
      method: "GET", redirect: "manual",
      headers: { Accept: "text/html" }, signal: AbortSignal.timeout(5000),
    });
    const lengthHeader = response.headers.get("content-length");
    const length = lengthHeader === null ? null : Number(lengthHeader);
    if (response.status !== 200 || !response.headers.get("content-type")?.toLowerCase().includes("text/html") ||
      (length !== null && (!Number.isFinite(length) || length > MAX_HTML_BYTES))) {
      await response.body?.cancel();
      return { status: "unreachable", url, checkedAt,
        diagnostic: `HTTPS returned HTTP ${response.status} or an invalid HTML content type/size.` };
    }
    // Bound actual bytes while streaming; never buffer an unlimited response.
    const html = await readBoundedHtml(response);
    const verified = html !== null &&
      html.toLowerCase().includes("<!doctype html>") &&
      html.includes("Powered by CAN OS") &&
      html.includes(`<footer>${input.host} · Powered by CAN OS</footer>`);
    return { status: verified ? "live" : "unreachable", url, checkedAt,
      diagnostic: verified ? "Public HTTPS returned CAN site HTML for this tenant." :
        "HTTPS responded, but the page did not identify this tenant's CAN public site." };
  } catch {
    return { status: "unreachable", url, checkedAt,
      diagnostic: "HTTPS request failed. Verify wildcard DNS, TLS certificate coverage, Netlify deployment and host routing." };
  }
}
