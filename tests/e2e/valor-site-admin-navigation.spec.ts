import { expect, test } from "@playwright/test";

test("Valor Site admin can open Site Today and reach class evidence", async ({ page }) => {
  test.skip(process.env.CAN_E2E_VALOR_SITE_ADMIN !== "true", "Requires an environment seeded with the Valor demo Site admin.");

  await page.goto("/access?returnTo=%2F");
  await page.getByRole("textbox", { name: "Email" }).fill("admin.demo@valorschool.demo");
  await page.getByLabel(/access code/i).fill("000000");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();

  const siteToday = "/sites/f1000000-0000-4000-8000-000000000003";
  await expect(page).toHaveURL(new RegExp(siteToday + "/?$"));
  const assertSiteToday = async () => {
    await expect(page.getByRole("heading", { level: 1, name: "Valor School" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Can this site receive students today?" })).toBeVisible();
  };
  await assertSiteToday();
  const response = await page.goto(siteToday);
  expect(response?.status()).toBe(200);
  await assertSiteToday();

  const sidebar = page.getByRole("navigation", { name: "CAN OS primary navigation" });
  await sidebar.getByRole("link", { name: "Launch", exact: true }).click();
  await expect(page.getByLabel("Continue with an existing Site")).toHaveValue(
    "f1000000-0000-4000-8000-000000000003",
  );
  await page.goto(siteToday);
  await sidebar.getByRole("link", { name: "Classes", exact: true }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Classes" })).toBeVisible();
  await sidebar.getByRole("link", { name: "Reports", exact: true }).click();
  await page.getByRole("link", { name: "Browse native Classes" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Class management" })).toBeVisible();
});
