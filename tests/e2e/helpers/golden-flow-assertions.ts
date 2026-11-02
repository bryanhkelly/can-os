import { expect, type Locator, type Page } from "@playwright/test";

/** Prove that visible GoldenFlow state survives a real browser reload. */
export async function expectVisibleAfterReload(
  page: Page,
  target: Locator,
): Promise<void> {
  await page.reload();
  await expect(target).toBeVisible();
}

/**
 * Prove that an authenticated but unauthorized persona receives the canonical
 * denial and that protected content is absent from the returned document.
 */
export async function expectProtectedPageDenied(
  page: Page,
  path: string,
  input: {
    denial: Locator;
    message?: string | RegExp;
    protectedContent?: readonly string[];
  },
): Promise<void> {
  const response = await page.goto(path);
  if (input.message === undefined) {
    await expect(input.denial).toBeVisible();
  } else {
    await expect(input.denial).toContainText(input.message);
  }

  if (input.protectedContent?.length) {
    if (!response) throw new Error("Protected-content denial requires a navigation response.");
    const html = await response.text();
    for (const content of input.protectedContent) {
      expect(html).not.toContain(content);
    }
  }
}
