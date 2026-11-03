/**
 * Private, bounded diagnostics for the opt-in church website extractor.
 * Never forward raw network error text, addresses, response bodies or headers
 * to church editors, parent websites, actions or unrestricted event payloads.
 */
export const churchWebFailureCodes = [
  "robots_denied", "unsafe_dns", "redirect_rejected", "response_rejected",
  "response_too_large", "timed_out", "network_failure",
  "no_usable_content", "unsafe_excerpt",
] as const;
export type ChurchWebFailureCode = typeof churchWebFailureCodes[number];
export type ChurchWebFetchDiagnosis = {
  code: ChurchWebFailureCode;
  state: "blocked" | "failed";
  message: string;
};

const details: Record<ChurchWebFailureCode, Omit<ChurchWebFetchDiagnosis, "code">> = {
  robots_denied: { state: "blocked",
    message: "This website's crawling rules do not permit automated reading. You can add a short church-written summary manually." },
  unsafe_dns: { state: "blocked",
    message: "The website could not pass public-network safety checks. Confirm its public HTTPS address or enter a summary manually." },
  redirect_rejected: { state: "blocked",
    message: "The website redirected outside the approved public source. Use a direct public church page or enter a summary manually." },
  response_rejected: { state: "failed",
    message: "The website did not provide a supported public HTML page. Try a public About page or add a summary manually." },
  response_too_large: { state: "blocked",
    message: "The website response exceeds the safe extraction limit. Use a shorter public page or enter a summary manually." },
  timed_out: { state: "failed",
    message: "The public website did not respond within the safe time limit. You can try again after the refresh interval or enter a summary." },
  network_failure: { state: "failed",
    message: "The public website could not be reached reliably. You can retry later or enter a summary manually." },
  no_usable_content: { state: "failed",
    message: "No suitable public church story text was found. You can supply an attributed church-written summary manually." },
  unsafe_excerpt: { state: "failed",
    message: "The retrieved pages did not contain suitable church-owned editorial text. Enter a short summary without school claims." },
};

export class ChurchWebFetchError extends Error {
  constructor(readonly code: ChurchWebFailureCode) {
    super(details[code].message);
    this.name = "ChurchWebFetchError";
  }
}

export function describeChurchWebFetchFailure(code: ChurchWebFailureCode): ChurchWebFetchDiagnosis {
  return { code, ...details[code] };
}

export function classifyChurchWebFetchFailure(error: unknown): ChurchWebFetchDiagnosis {
  if (error instanceof ChurchWebFetchError) return describeChurchWebFetchFailure(error.code);
  const value = error instanceof Error ? error.message : "";
  if (/robots/i.test(value)) return describeChurchWebFetchFailure("robots_denied");
  if (/DNS|public address|nonpublic|private network/i.test(value))
    return describeChurchWebFetchFailure("unsafe_dns");
  if (/redirect|cross-origin|invalid church website/i.test(value))
    return describeChurchWebFetchFailure("redirect_rejected");
  if (/oversized|exceeded.*limit|too large/i.test(value))
    return describeChurchWebFetchFailure("response_too_large");
  if (/timed out|timeout|ETIMEDOUT/i.test(value))
    return describeChurchWebFetchFailure("timed_out");
  if (/unsupported|did not return a public page|non-HTML/i.test(value))
    return describeChurchWebFetchFailure("response_rejected");
  if (/no public|no suitable|no church story/i.test(value))
    return describeChurchWebFetchFailure("no_usable_content");
  return describeChurchWebFetchFailure("network_failure");
}

/** A deterministic fail-closed reason when no candidate pages succeed. */
export function summaryChurchWebFetchFailure(
  codes: readonly ChurchWebFailureCode[],
): ChurchWebFailureCode {
  for (const priority of ["unsafe_dns", "redirect_rejected", "robots_denied",
    "response_too_large", "timed_out", "response_rejected", "network_failure"] as const) {
    if (codes.includes(priority)) return priority;
  }
  return "no_usable_content";
}
