import { auditAccessibility } from "./ui-accessibility";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";

export async function testUxPolish({ admin, staff, client, base, eventId }: {
  admin: Page; staff: Page; client: Page; base: string; eventId: string;
}) {
  const publicPage = await admin.context().browser()!.newPage();
  const browserErrors: string[] = [];
  publicPage.on("pageerror", error => browserErrors.push(error.message));
  publicPage.on("console", message => { if (message.type() === "error") browserErrors.push(message.text()); });
  const capture = async (page: Page, name: string) => {
    await mkdir("test-results/ux-polish", { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-results/ux-polish/${name}.png`, fullPage: !await page.getByRole("dialog").count() });
    await auditAccessibility(page);
  };
  try {
    for (const width of [320, 390, 768, 1024, 1440]) {
      await publicPage.setViewportSize({ width, height: 900 });
      for (const route of ["/", "/login"]) {
        await publicPage.goto(`${base}${route}`);
        await expect(publicPage.locator("main h1")).toBeVisible();
        if (width === 390 || width === 1440) await auditAccessibility(publicPage);
        assert.ok(await publicPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      }
      await capture(publicPage, `login-${width}`);
    }
    // Real failed action: values must survive React's form reset behavior.
    await publicPage.getByLabel("Alamat email").fill("ux-polish-missing@example.invalid");
    await publicPage.getByLabel("Password", { exact: true }).fill("Invalid-password-123");
    await publicPage.getByRole("button", { name: "Masuk ke dashboard" }).click();
    await expect(publicPage.locator("form").getByRole("alert")).toBeVisible();
    await expect(publicPage.getByLabel("Alamat email")).toHaveValue("ux-polish-missing@example.invalid");
    await expect(publicPage.getByLabel("Password", { exact: true })).toHaveValue("Invalid-password-123");

    for (const [page, role] of [[staff, "staff"], [client, "client"]] as const) {
      await page.goto(`${base}/${role}/events/${eventId}`);
      const link = page.getByRole("navigation", { name: "Breadcrumb" }).getByRole("link", { name: "Acara", exact: true });
      await expect(link).toHaveAttribute("href", `/${role}#events`);
      await link.click();
      await expect(page.locator("#events")).toBeVisible();
    }

    await admin.goto(`${base}/admin/events/${eventId}`);
    const assignment = admin.locator("form").filter({ has: admin.getByRole("heading", { name: "Petugas acara" }) });
    await assignment.getByRole("checkbox", { name: /Dimas/ }).uncheck();
    await assignment.getByRole("button", { name: "Simpan penugasan" }).click();
    const dialog = admin.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Batal", exact: true })).toBeFocused();
    await admin.route(`**/api/admin/events/${eventId}/staff`, route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Penugasan belum dapat disimpan. Coba lagi." }) }));
    await dialog.getByRole("button", { name: "Konfirmasi", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Penugasan belum dapat disimpan");
    await expect(admin.locator('[data-sonner-toast][data-type="error"]')).toHaveCount(0);
    await capture(admin, "assignment-error");
    await admin.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await admin.unroute(`**/api/admin/events/${eventId}/staff`);

    await admin.goto(`${base}/admin/users`);
    await admin.setViewportSize({ width: 390, height: 844 });
    await admin.getByRole("button", { name: "Edit akun Dimas", exact: true }).click();
    await expect(admin.getByRole("heading", { name: "Edit akun", exact: true })).toBeFocused();
    await admin.getByLabel("Nama", { exact: true }).fill(" ");
    await admin.getByRole("button", { name: "Simpan akun" }).click();
    await expect(admin.getByLabel("Nama", { exact: true })).toHaveAttribute("aria-invalid", "true");
    await expect(admin.locator("#account-name-error")).not.toBeEmpty();
    await capture(admin, "account-validation-390");

    await admin.goto(`${base}/admin/clients/new`);
    await admin.getByLabel("Nama client").fill("Client percobaan");
    await admin.route("**/api/admin/clients", route => route.fulfill({ status: 422, contentType: "application/json", body: JSON.stringify({ error: "Periksa jenis client.", fields: { type: ["Jenis client tidak valid."] } }) }));
    await admin.getByRole("button", { name: "Simpan client" }).click();
    await expect(admin.getByLabel("Jenis client")).toHaveAttribute("aria-invalid", "true");
    await expect(admin.getByLabel("Nama client")).toHaveValue("Client percobaan");
    await admin.unroute("**/api/admin/clients");
    await publicPage.emulateMedia({ reducedMotion: "reduce", colorScheme: "dark" });
    assert.equal(await publicPage.locator("html").evaluate(el => getComputedStyle(el).colorScheme), "light");
    const duration = await publicPage.getByRole("button", { name: "Masuk ke dashboard" }).evaluate(el => parseFloat(getComputedStyle(el).transitionDuration));
    assert.ok(duration < 0.001, "Reduced motion overrides transitions");
    assert.deepEqual(browserErrors, [], "No public console/hydration errors");
    console.log("Sprint 3 passed: login retention, five viewport sizes, role breadcrumbs, modal errors, account focus, field errors, reduced motion, light theme and public console.");
  } finally { await publicPage.close(); }
}
