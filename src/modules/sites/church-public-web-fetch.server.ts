import { resolve4 } from "node:dns/promises";
import https from "node:https";
import { normalizeChurchReferenceUrl } from "@/domain/church-source-references";
import { boundedChurchBrandEvidence, type ChurchBrandEvidence } from "@/domain/church-brand-suggestions";

/**
 * Bounded public-HTML fetch for voluntary church-website evidence.
 * DNS answers are validated and pinned to the actual TLS connection to avoid
 * time-of-check/time-of-use DNS rebinding. Never pass authenticated headers.
 * Not a general web crawler, search service, social scraper, or asset fetcher.
 */
const MAX_HTML_BYTES = 128 * 1024;
const MAX_ROBOTS_BYTES = 16 * 1024;
const REQUEST_TIMEOUT_MS = 5000;

export function isPublicIPv4(address: string): boolean {
  const parts = address.split(".");
  if (parts.length !== 4 || parts.some(p => !/^\d{1,3}$/.test(p) || Number(p) > 255)) return false;
  const [a,b,c] = parts.map(Number);
  if (a === undefined || b === undefined || c === undefined) return false;
  if (a === 0 || a === 10 || a === 127 || a >= 224 ||
      a === 169 && b === 254 ||
      a === 172 && b >= 16 && b <= 31 ||
      a === 192 && (b === 168 || b === 0 && c === 0 || b === 0 && c === 2 || b === 88 && c === 99) ||
      a === 100 && b >= 64 && b <= 127 ||
      a === 198 && (b === 18 || b === 19 || b === 51 && c === 100) ||
      a === 203 && b === 0 && c === 113 ||
      a === 255) return false;
  return true;
}

export type WebsitePageEvidence = {
  pageUrl: string;
  pageText: string;
  sourceField: "welcome_message" | "church_history" | "church_mission" |
    "leadership_intro" | "ministries";
  brandEvidence?: ChurchBrandEvidence[];
};

export function plainHtmlText(html: string) {
  let fragment = html.replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(?:script|style|noscript|template|svg|form|iframe)\b[^>]*>[\s\S]*?<\/\s*(?:script|style|noscript|template|svg|form|iframe)\s*>/gi, " ");
  const main = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(fragment);
  if (main) fragment = main[1] ?? "";
  fragment = fragment.replace(/<(?:header|nav|footer)\b[^>]*>[\s\S]*?<\/\s*(?:header|nav|footer)\s*>/gi, " ");
  const parts = [...fragment.matchAll(/<(?:h1|h2|p)\b[^>]*>([\s\S]*?)<\/\s*(?:h1|h2|p)\s*>/gi)]
    .map(m => (m[1] ?? "").replace(/<[^>]*>/g, " ")
      .replace(/&(?:nbsp|#160);/gi, " ")
      .replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"').replace(/&#39;/gi, "'")
      .replace(/&#(\d+);/g, (_, n: string) => {
        const code = Number(n);
        return code >= 32 && code <= 0xffff ? String.fromCharCode(code) : " ";
      })
      .replace(/[\u0000-\u001f\u007f]/g, " ")
      .replace(/\s+/g, " ").trim())
    .filter(x => x.length >= 28 && x.length <= 1200);
  // Do not include the entire downloaded page, scripts, tracking or embeds.
  return [...new Set(parts)].slice(0, 5).join("\n").slice(0, 1200).trim();
}

export function robotsAllows(robots: string, pathname: string): boolean {
  // A group may have several consecutive User-agent lines. The first
  // Allow/Disallow starts its rules; the next User-agent starts a new group.
  // Explicit matching groups take precedence over the generic "*" group.
  type Rule = { allow: boolean; length: number; pattern: RegExp };
  type Group = { agents: string[]; rules: Rule[] };
  const groups: Group[] = [];
  let group: Group | undefined;
  let hasRules = false;

  for (const raw of robots.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    if (!line) continue;
    const parsed = /^([\w-]+)\s*:\s*(.*)$/i.exec(line);
    if (!parsed) continue;
    const directive = parsed[1]!.toLowerCase();
    const value = parsed[2]!.trim();
    if (directive === "user-agent") {
      if (!group || hasRules) {
        group = { agents: [], rules: [] };
        groups.push(group);
        hasRules = false;
      }
      group.agents.push(value.toLowerCase());
      continue;
    }
    if (!group || (directive !== "allow" && directive !== "disallow")) continue;
    hasRules = true;
    if (!value) continue;
    const anchored = value.endsWith("$");
    const source = (anchored ? value.slice(0, -1) : value)
      .split("*").map(part => part.replace(/[|\\{}()[\]^$+?.]/g, "\\$&")).join(".*");
    try {
      group.rules.push({
        allow: directive === "allow",
        length: value.replace(/[*$]/g, "").length,
        pattern: new RegExp("^" + source + (anchored ? "$" : "")),
      });
    } catch {
      if (directive === "disallow") return false;
    }
  }

  const ourAgent = "canos-churchreference/1.0";
  const matchingNames = groups.flatMap(g => g.agents)
    .filter(agent => agent !== "*" && ourAgent.startsWith(agent));
  const longestAgent = matchingNames.reduce((max, name) => Math.max(max, name.length), 0);
  const selected = longestAgent
    ? groups.filter(g => g.agents.some(a => a !== "*" &&
      a.length === longestAgent && ourAgent.startsWith(a)))
    : groups.filter(g => g.agents.includes("*"));
  const matches = selected.flatMap(g => g.rules)
    .filter(rule => rule.pattern.test(pathname))
    .sort((a, b) => b.length - a.length || Number(b.allow) - Number(a.allow));
  return matches[0]?.allow ?? true;
}

async function publicAddress(hostname: string): Promise<string> {
  // Only use IPv4; IPv6-only hosts fail closed. No raw IP literals are accepted.
  const addresses = await resolve4(hostname);
  if (!addresses.length || addresses.length > 12 || addresses.some(ip => !isPublicIPv4(ip))) {
    throw new Error("Church website DNS did not resolve to exclusively public addresses");
  }
  return addresses[0]!;
}

async function requestPublicPage(
  pageUrl: string, expectedOrigin: string, limit: number, redirects = 0,
  robotsText?: string,
): Promise<{ status: number; text: string; url: string }> {
  const safeUrl = normalizeChurchReferenceUrl("website", pageUrl);
  const url = new URL(safeUrl);
  if (url.origin !== expectedOrigin) throw new Error("Cross-origin church website redirects are unavailable");
  if (robotsText && !robotsAllows(robotsText, url.pathname)) {
    throw new Error("Church website robots instructions prohibit this path");
  }
  if (redirects > 2) throw new Error("Too many church website redirects");
  const ip = await publicAddress(url.hostname);
  return new Promise((resolve, reject) => {
    // Connection is pinned to the validated address while SNI/hostname/TLS
    // certificate verification remain tied to the original domain.
    const agent = new https.Agent({
      keepAlive: false, maxSockets: 1,
      lookup: (_hostname, _options, callback) => callback(null, ip, 4),
    });
    const request = https.request(url, {
      agent, timeout: REQUEST_TIMEOUT_MS, method: "GET",
      headers: {
        Accept: limit === MAX_ROBOTS_BYTES ? "text/plain" : "text/html",
        "Accept-Encoding": "identity",
        "User-Agent": "CANOS-ChurchReference/1.0 (+verified church partner setup)",
      },
    }, response => {
      const status = response.statusCode ?? 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        agent.destroy();
        let next: string;
        try { next = new URL(location, url).toString(); }
        catch { reject(new Error("Invalid church website redirect")); return; }
        void requestPublicPage(next, expectedOrigin, limit, redirects + 1, robotsText).then(resolve, reject);
        return;
      }
      if (status === 404) {
        response.resume(); agent.destroy(); resolve({ status, text: "", url: safeUrl }); return;
      }
      if (status !== 200) {
        response.resume(); agent.destroy(); reject(new Error("Church website did not return a public page")); return;
      }
      const mime = String(response.headers["content-type"] ?? "").toLowerCase();
      const allowedMime = limit === MAX_ROBOTS_BYTES ? /^text\/plain(?:;|$)/.test(mime) : /^text\/html(?:;|$)/.test(mime);
      if (!allowedMime || response.headers["content-encoding"] ||
          Number(response.headers["content-length"] ?? 0) > limit) {
        response.destroy();
        agent.destroy();
        reject(new Error("Unsupported or oversized church website response"));
        return;
      }
      const chunks: Buffer[] = [];
      let total = 0;
      response.on("data", (chunk: Buffer) => {
        total += chunk.length;
        if (total > limit) {
          response.destroy(new Error("Church website exceeded the bounded page limit"));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => {
        agent.destroy();
        resolve({ status, text: Buffer.concat(chunks).toString("utf8"), url: safeUrl });
      });
      response.on("error", reject);
    });
    request.on("timeout", () => request.destroy(new Error("Church website request timed out")));
    request.on("error", error => { agent.destroy(); reject(error); });
    request.end();
  });
}

export async function extractChurchPublicWebsite(
  rawWebsiteUrl: string,
): Promise<WebsitePageEvidence[]> {
  const website = normalizeChurchReferenceUrl("website", rawWebsiteUrl);
  const parsed = new URL(website), origin = parsed.origin;
  const robots = await requestPublicPage(new URL("/robots.txt", origin).toString(), origin, MAX_ROBOTS_BYTES);
  if (robots.status === 200 && !robotsAllows(robots.text, parsed.pathname)) {
    throw new Error("Church website robots instructions prohibit collection");
  }
  const candidates: ReadonlyArray<{ path: string; field: WebsitePageEvidence["sourceField"] }> = [
    { path: parsed.pathname, field: "welcome_message" },
    { path: "/about", field: "church_history" },
    { path: "/our-story", field: "church_history" },
    { path: "/mission", field: "church_mission" },
    { path: "/leadership", field: "leadership_intro" },
    { path: "/ministries", field: "ministries" },
  ];
  const results: WebsitePageEvidence[] = [];
  const dedup = new Set<string>();
  for (const candidate of candidates) {
    if (results.length >= 5) break;
    const url = new URL(candidate.path, origin);
    if (dedup.has(url.pathname)) continue;
    dedup.add(url.pathname);
    if (robots.status === 200 && !robotsAllows(robots.text, url.pathname)) continue;
    try {
      const response = await requestPublicPage(url.toString(), origin, MAX_HTML_BYTES, 0,
        robots.status === 200 ? robots.text : undefined);
      if (response.status !== 200) continue;
      const pageText = plainHtmlText(response.text);
      if (pageText.length >= 45) results.push({
        pageUrl: response.url, pageText, sourceField: candidate.field,
        ...(candidate.path === parsed.pathname
          ? { brandEvidence: boundedChurchBrandEvidence(response.text, response.url) } : {}),
      });
    } catch {
      // Per-page failure never manufactures evidence or blocks other pages.
    }
  }
  if (!results.length) throw new Error("No public, permitted church website text could be retrieved");
  return results;
}
