import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";

export async function testPrecheckinBrowser(input: { base: string; slug: string; eventId: string; cookies: Map<string, string>; adminCookies: Map<string, string> }) {
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`${input.base}/e/${input.slug}/checkin`);
    await page.getByLabel("Nama pada undangan").fill("Family 5");
    await page.getByRole("button", { name: "Lanjut", exact: true }).click();
    const receipt = page.getByRole("region", { name: "Tiket sementara" });
    await expect(receipt).toBeVisible();
    const queueCode = await receipt.locator("p.font-mono").innerText();
    assert.match(queueCode, /^[A-F0-9]{8}$/);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Public receipt fits mobile viewport");
    }
    await receipt.getByText("Token cadangan untuk petugas").click();
    await expect(receipt.locator("code")).toHaveText(/^PCT-/);
    assert.equal(page.url().includes("PCT-"), false, "Secret token never enters URL");
    const staff = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await staff.addCookies([...input.cookies].map(([name, value]) => ({ name, value, url: input.base })));
    const desk = await staff.newPage();
    desk.on("pageerror", error => errors.push(error.message));
    await desk.goto(`${input.base}/staff/events/${input.eventId}`);
    await desk.getByRole("button", { name: "Antrean pre-check-in", exact: true }).click();
    await desk.getByLabel("Kode antrean atau token sementara").fill(queueCode);
    await desk.getByRole("button", { name: "Buka tiket", exact: true }).click();
    await desk.getByRole("button", { name: /^Family 5/ }).click();
    const dialog = desk.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Konfirmasi check-in", exact: true })).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    let dropFirst = true;
    await desk.route("**/api/checkins", async route => {
      if (route.request().method() !== "POST" || !dropFirst) { await route.continue(); return; }
      dropFirst = false;
      const response = await route.fetch();
      assert.equal(response.status(), 201);
      await route.abort("failed"); // Commit succeeded but the response was lost.
    });
    await dialog.getByRole("button", { name: "Konfirmasi check-in", exact: true }).click();
    await expect(dialog.getByRole("alert")).toContainText("Hasil belum diketahui");
    await dialog.getByRole("button", { name: "Coba ulang transaksi", exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(desk.getByText(/Retry terkonfirmasi; tidak ada tambahan pencatatan/)).toBeVisible();
    assert.equal(await desk.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Staff queue fits mobile viewport");
    const admin = await browser.newContext();
    await admin.addCookies([...input.adminCookies].map(([name, value]) => ({ name, value, url: input.base })));
    const poster = await admin.newPage();
    await poster.goto(`${input.base}/api/admin/events/${input.eventId}/public-qr`);
    await expect(poster.getByRole("button", { name: "Cetak QR umum" })).toBeEnabled();
    await expect(poster.getByRole("img", { name: "QR pre-check-in acara" })).toBeVisible();
    assert.deepEqual(errors, [], "No browser runtime errors");
    console.log("Public pre-check-in browser: mobile guest flow, token privacy, manual confirmation, lost-response retry and print readiness passed.");
  } finally { await browser.close(); }
}
