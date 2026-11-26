/** A provider ID must be usable for both synchronous and webhook correlation.
 * Preserve the opaque identifier exactly; never trim, coerce or invent it. */
export function isEmailProviderMessageId(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 256 &&
    !/\s/u.test(value) && [...value].every(character => {
    const code = character.charCodeAt(0);
    return code >= 32 && code !== 127;
  });
}

/** Provider acceptance and confirmed delivery are different states. */
export function readEmailProviderMessageId(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("id" in body)) {
    return undefined;
  }
  return isEmailProviderMessageId(body.id) ? body.id : undefined;
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
