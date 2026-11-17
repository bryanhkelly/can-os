/** Small shared fail-closed checks for distinct Playwright execution profiles. */
const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function requireLocalHttpUrl(baseURL: string, profile: string): URL {
  const url = new URL(baseURL);
  if (url.protocol !== "http:" || !loopbackHosts.has(url.hostname)) {
    throw new Error(profile + " requires an HTTP loopback application, not a live site.");
  }
  return url;
}

/**
 * Deployed release acceptance is pinned to the exact source commit.
 * The caller remains responsible for stricter profile-specific write guards.
 */
export function requirePinnedReleaseUrl(args: {
  baseURL: string | undefined;
  sourceSha: string | undefined;
  deployedSha: string | undefined;
  profile: string;
}): URL {
  const { baseURL, sourceSha, deployedSha, profile } = args;
  if (!baseURL) throw new Error(profile + " requires CAN_RELEASE_E2E_URL.");
  const url = new URL(baseURL);
  if (url.protocol !== "https:" &&
    !(url.protocol === "http:" && loopbackHosts.has(url.hostname))) {
    throw new Error(profile + " requires HTTPS or HTTP loopback.");
  }
  if (!sourceSha || !deployedSha || !/^[a-f0-9]{40}$/i.test(sourceSha) ||
      sourceSha !== deployedSha) {
    throw new Error(profile + " requires matching source and deployed release SHAs.");
  }
  return url;
}
