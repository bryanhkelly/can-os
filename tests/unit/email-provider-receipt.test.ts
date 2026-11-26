import { describe, expect, it } from "vitest";
import { readEmailProviderMessageId, readEmailProviderReceipt } from "@/domain/email-provider-receipt";

describe("email provider receipt evidence", () => {
  it.each([null, undefined, false, 0, "", [], {}, { id: null }, { id: 42 }, { id: "" }, { id: "receipt" }, { id: "        " },
    { id: " opaque-provider" }, { id: "opaque-provider\n" }, { id: "opaque\u0000provider" },
    { id: "x".repeat(257) }]
    .map(body => ({ body })))(
    "does not infer provider evidence from $body", ({ body }) => {
      expect(readEmailProviderMessageId(body)).toBeUndefined();
    },
  );

  it("preserves the exact opaque provider identifier", () => {
    expect(readEmailProviderMessageId({ id: "abcdefgh" })).toBe("abcdefgh");
    expect(readEmailProviderMessageId({ id: "x".repeat(256) })).toBe("x".repeat(256));
    expect(readEmailProviderMessageId({ id: "opaque-provider-123" })).toBe("opaque-provider-123");
  });

  it("returns a receipt from a valid JSON response", async () => {
    const response = new Response(JSON.stringify({ id: "opaque-provider-123" }));
    expect(await readEmailProviderReceipt(response)).toBe("opaque-provider-123");
  });

  it.each(["", "{invalid json", "null", '{"id":42}', '{"id":""}'])(
    "does not fabricate a receipt for a malformed or missing response: %s", async body => {
      expect(await readEmailProviderReceipt(new Response(body))).toBeUndefined();
    },
  );

  it("leaves acceptance policy to the caller rather than inferring delivery", async () => {
    const response = new Response(JSON.stringify({ id: "opaque-provider-123" }), { status: 500 });
    expect(await readEmailProviderReceipt(response)).toBe("opaque-provider-123");
  });
});
