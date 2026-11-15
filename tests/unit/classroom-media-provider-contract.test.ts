import { describe, expect, it } from "vitest";
import { resolveClassVideo } from "@/domain/class-video";
describe("Classroom presentation media allowlist",()=>{
  it("permits known YouTube and Vimeo video IDs",()=>{
    expect(resolveClassVideo("https://www.youtube.com/watch?v=dQw4w9WgXcQ")?.kind).toBe("embed");
    expect(resolveClassVideo("https://vimeo.com/123456789")?.kind).toBe("embed");
  });
  it("rejects arbitrary third-party frames and non-HTTPS providers",()=>{
    expect(resolveClassVideo("https://attacker.example.com/watch?v=dQw4w9WgXcQ")).toBeNull();
    expect(resolveClassVideo("http://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBeNull();
  });
});
