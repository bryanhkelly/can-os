import { createHash, createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { neon } from "@neondatabase/serverless";
import { DATABASE_URL } from "./env";
import { createGf1Fixture, type Gf1Fixture, type Sql } from "./fixture";
import { withAuthenticatedPage } from "./helpers/authenticated-persona";

let sql: Sql;
let fixture: Gf1Fixture | undefined;
const uploadedKeys = new Set<string>();

// Cleanup is restricted to this fixture's objects; production signing never allows DELETE.
async function deleteFixtureObject(key: string) {
  if (!fixture || !key.startsWith(`learning/assignment/${fixture.assessmentId}/`)) {
    throw new Error("Refusing to delete an object outside the isolated assignment fixture");
  }
  const { CAN_R2_ACCOUNT_ID: account, CAN_R2_BUCKET: bucket,
    CAN_R2_ACCESS_KEY_ID: accessKey, CAN_R2_SECRET_ACCESS_KEY: secret } = process.env;
  if (!account || !bucket || !accessKey || !secret) throw new Error("Missing test storage credentials");
  const hash = (value: string) => createHash("sha256").update(value).digest("hex");
  const hmac = (key: string | Buffer, value: string) => createHmac("sha256", key).update(value).digest();
  const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = stamp.slice(0, 8);
  const host = `${account}.r2.cloudflarestorage.com`;
  const path = `/${bucket}/${key.split("/").map(encodeURIComponent).join("/")}`;
  const scope = `${day}/auto/s3/aws4_request`;
  const query = new URLSearchParams({
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${accessKey}/${scope}`,
    "X-Amz-Date": stamp,
    "X-Amz-Expires": "60",
    "X-Amz-SignedHeaders": "host",
  });
  query.sort();
  const canonical = ["DELETE", path, query.toString(), `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secret}`, day), "auto"), "s3"), "aws4_request");
  const signature = createHmac("sha256", signingKey)
    .update(["AWS4-HMAC-SHA256", stamp, scope, hash(canonical)].join("\n")).digest("hex");
  const response = await fetch(`https://${host}${path}?${query}&X-Amz-Signature=${signature}`, { method: "DELETE" });
  if (!response.ok) throw new Error(`Synthetic R2 object cleanup failed (${response.status})`);
}

test.describe("Assignment upload feedback with live private R2", () => {
  test.skip(!process.env.CAN_R2_ACCOUNT_ID || !process.env.CAN_R2_BUCKET ||
    !process.env.CAN_R2_ACCESS_KEY_ID || !process.env.CAN_R2_SECRET_ACCESS_KEY,
  "Requires explicitly configured private R2 credentials and an isolated browser database");

  test.beforeAll(async () => {
    if (!DATABASE_URL) throw new Error("Missing isolated browser database");
    sql = neon(DATABASE_URL);
    fixture = await createGf1Fixture(sql);
  });

  test.afterAll(async () => {
    try {
      for (const key of uploadedKeys) await deleteFixtureObject(key);
    } finally {
      if (fixture) {
        const accounts = [fixture.studentAccountId, fixture.teacherAccountId,
          fixture.guardianAccountId, fixture.specialistAccountId];
        await sql.query(`UPDATE access_sessions SET revoked_at=now()
          WHERE account_id=ANY($1::uuid[]) AND revoked_at IS NULL`, [accounts]);
      }
    }
  });

  test("failed upload stays visible and retry gives a durable file-only submission receipt", async ({ browser }) => {
    if (!fixture) throw new Error("Missing assignment fixture");
    const f = fixture;
    await withAuthenticatedPage(browser, f.studentSecret, async ({ page }) => {
      await page.goto(`/student/assignments?filter=todo&assessment=${f.assessmentId}`);
      const submit = page.getByRole("button", { name: "Submit assignment", exact: true });
      await expect(submit).toBeVisible();
      const response = page.getByRole("textbox", { name: /Your response/ });
      await expect(response).toHaveValue("");
      await page.getByLabel("Attachments (PDF, PNG or JPEG; maximum 10 MB each)").setInputFiles({
        name: "synthetic-assignment.pdf", mimeType: "application/pdf",
        buffer: Buffer.from("%PDF-1.4\n% isolated synthetic assignment submission\n%%EOF\n"),
      });

      let releaseUpload!: () => void;
      const uploadGate = new Promise<void>(resolve => { releaseUpload = resolve; });
      const uploadPattern = `https://${process.env.CAN_R2_ACCOUNT_ID}.r2.cloudflarestorage.com/**`;
      page.on("request", request => {
        if (request.method() !== "PUT") return;
        const url = new URL(request.url());
        const prefix = `/${process.env.CAN_R2_BUCKET}/learning/assignment/${f.assessmentId}/`;
        if (url.pathname.startsWith(prefix)) {
          uploadedKeys.add(decodeURIComponent(url.pathname.slice(`/${process.env.CAN_R2_BUCKET}/`.length)));
        }
      });
      await page.route(uploadPattern, async route => {
        if (route.request().method() !== "PUT") return route.continue();
        await uploadGate;
        await route.fulfill({ status: 503, body: "Synthetic upload outage" });
      });
      try {
        await submit.click();
        await expect(page.getByRole("button", { name: "Saving assignment..." })).toBeDisabled();
        await expect(response).toBeDisabled();
        await expect(page.getByRole("status").filter({ hasText: "Uploading synthetic-assignment.pdf..." })).toBeVisible();
      } finally {
        releaseUpload();
      }
      const failure = page.getByRole("alert").filter({ hasText: "Upload failed for synthetic-assignment.pdf" });
      await expect(failure).toBeFocused();
      await expect(failure).toBeInViewport();
      await expect(page.getByText(/Not yet uploaded: synthetic-assignment.pdf/)).toBeVisible();
      const [notSubmitted] = await sql`SELECT status FROM submissions WHERE id=${f.submissionId}`;
      expect(notSubmitted.status).not.toBe("submitted");

      await page.unroute(uploadPattern);
      await submit.click();
      const receipt = page.getByRole("status").filter({ hasText: "Your assignment has been submitted. Receipt:" });
      await expect(receipt).toBeFocused();
      await expect(receipt).toBeInViewport();
      await expect(receipt).toContainText(f.submissionId);
      await expect(page.getByRole("button", { name: "Submit assignment", exact: true })).toHaveCount(0);
      await expect(page.getByText("No assignments in this view.")).toBeVisible();
      const [submitted] = await sql`SELECT status, submitted_at FROM submissions WHERE id=${f.submissionId}`;
      expect(submitted.status).toBe("submitted");
      expect(submitted.submitted_at).toBeTruthy();

      await page.goto(`/student/assignments?filter=all&assessment=${f.assessmentId}`);
      await expect(page.getByText(`Receipt: ${f.submissionId}`, { exact: false })).toBeVisible();
      await expect(page.getByRole("button", { name: "synthetic-assignment.pdf", exact: true })).toBeVisible();
    });
  });
});
