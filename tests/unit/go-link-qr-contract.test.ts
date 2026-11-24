import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const read=(path:string)=>readFileSync(new URL("../../"+path,import.meta.url),"utf8");
describe("Safe offline QR creation",()=>{
  it("creates QR locally from the verified share origin, never an external service",()=>{
    const qr=read("src/components/links/GoLinkQrButton.tsx");
    expect(qr).toContain("getCanonicalGoLinkShareOrigin()");
    expect(qr).toContain('import("qrcode")');
    expect(qr).toContain("QRCode.toDataURL");
    expect(qr).toContain("Download PNG");
    expect(qr).not.toMatch(/qrserver|quickchart|chart\.googleapis|fetch\(/);
    expect(read("src/components/launch-studio/GoLinkWorkspace.tsx"))
      .toContain("<GoLinkQrButton");
  });
});
