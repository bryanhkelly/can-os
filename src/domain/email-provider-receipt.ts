/** Provider acceptance and confirmed delivery are different states.
 * Only a nonempty provider-assigned identifier is usable as receipt evidence. */
export function readEmailProviderMessageId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("id" in body)) {
    return undefined;
  }
  return typeof body.id === "string" && body.id.length > 0 ? body.id : undefined;
}

/** Missing or malformed response JSON does not supply a receipt. Callers
 * decide whether HTTP acceptance without a receipt is sufficient. */
export async function readEmailProviderReceipt(
  response: Pick<Response, "json">,
): Promise<string | undefined> {
  try {
    return readEmailProviderMessageId(await response.json());
  } catch {
    return undefined;
  }
}
