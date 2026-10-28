import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium, expect } from "@playwright/test";
import jsQR from "jsqr";
import { PNG } from "pngjs";

export async function testQrBrowser({ base, eventId, invitationId, code, cookies }: {
  base: string; eventId: string; invitationId: string; code: string;
  cookies: Map<string, string>;
}) {
  const browser = await chromium.launch({ channel: process.env.QR_BROWSER_CHANNEL || "msedge", headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    await context.addCookies([...cookies].map(([name, value]) => ({ name, value, url: base, httpOnly: true, sameSite: "Lax" as const })));
    // Exercise the actual print button without opening an OS print dialog.
    await context.addInitScript(() => { window.print = () => { document.documentElement.dataset.printInvoked = "true"; }; });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/admin/events/${eventId}/guests`);
    const actions = page.getByTestId(`invitation-actions-${invitationId}`);
    await expect(actions).toBeVisible();
    await actions.getByRole("button", { name: "Lihat QR" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(code, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("img")).toBeVisible();
    await expect(dialog.getByRole("heading", { name: "Updated QR guest" })).toBeVisible();
    const image = await dialog.getByRole("img").getAttribute("src");
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await page.reload();
    await actions.getByRole("button", { name: "Lihat QR" }).click();
    await expect(dialog.getByText(code, { exact: true })).toBeVisible();
    assert.equal(await dialog.getByRole("img").getAttribute("src"), image);
    await dialog.getByRole("button", { name: "Close", exact: true }).click();
    const downloadPromise = page.waitForEvent("download");
    await actions.getByRole("button", { name: "Download QR" }).click();
    const download = await downloadPromise;
    assert.equal(download.suggestedFilename(), `wedflow-invitation-${invitationId}.png`);
    const png = PNG.sync.read(await readFile((await download.path())!));
    assert.equal(jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data, code);
    const popupPromise = page.waitForEvent("popup");
    await actions.getByRole("link", { name: /Print undangan/ }).click();
    const printPage = await popupPromise;
    const printButton = printPage.getByRole("button", { name: "Print undangan", exact: true });
    await expect(printButton).toBeEnabled();
    await printButton.click();
    await expect(printPage.locator("html")).toHaveAttribute("data-print-invoked", "true");
    await printPage.emulateMedia({ media: "print" });
    await expect(printPage.locator(".tools")).toBeHidden();
    await expect(printPage.getByRole("img")).toBeVisible();
    const pdf = await printPage.pdf({ preferCSSPageSize: true, printBackground: true });
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 1, "Invitation prints on one page");
    await printPage.close();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Mobile page should not overflow horizontally");
    assert.deepEqual(errors, [], "QR UI should have no browser errors");
    await context.close();
    console.log("QR browser passed: mobile preview, refresh, PNG download, print button and one-page PDF.");
  } finally { await browser.close(); }
}
