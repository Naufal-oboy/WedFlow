import { auditAccessibility } from "./ui-accessibility";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
import { expect, type Page } from "@playwright/test";

// Runs with the UUID-scoped fixtures and finally-cleanup of test-ui-redesign.
export async function testGuestExperience({ admin, staff, client, base, eventId, slug }: {
  admin: Page; staff: Page; client: Page; base: string; eventId: string; slug: string;
}) {
  const guests = `${base}/admin/events/${eventId}/guests`;
  const api = `${base}/api/admin/events/${eventId}/guests`;
  const publicPage = await admin.context().browser()!.newPage();
  const fits = async (page: Page) => {
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `No page overflow: ${new URL(page.url()).pathname}`);
    for (const dialog of await page.getByRole("dialog").all()) {
      const box = await dialog.boundingBox();
      assert.ok(box && box.x >= 0 && box.x + box.width <= page.viewportSize()!.width, "Dialog fits viewport");
    }
  };
  const capture = async (page: Page, name: string) => {
    await auditAccessibility(page);
    if (!process.env.GUEST_SCREENSHOTS) return;
    await mkdir("test-results/ux-polish", { recursive: true });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `test-results/ux-polish/${name}.png` });
  };
  try {
    const initial = await (await admin.request.get(api)).json();
    assert.equal(initial.guests.length, 1);
    assert.ok((await admin.request.delete(`${api}/${initial.guests[0].id}`, { headers: { Origin: base } })).ok());
    await admin.goto(guests);
    await expect(admin.getByRole("heading", { name: "Daftar tamu masih kosong", exact: true })).toBeVisible();
    await admin.getByRole("button", { name: "Tambah tamu", exact: true }).click();
    let dialog = admin.getByRole("dialog");
    await dialog.getByLabel("Nama tamu", { exact: true }).fill("Tamu Percobaan");
    await dialog.getByLabel("Kuota undangan").fill("3");
    await dialog.getByRole("button", { name: "Simpan undangan" }).click();
    await expect(dialog).toBeHidden();
    await admin.getByRole("link", { name: "Tamu Percobaan", exact: true }).click();
    await admin.getByRole("button", { name: "Edit Tamu Percobaan", exact: true }).click();
    await dialog.getByLabel("Nama tamu", { exact: true }).fill("Tamu Diperbarui");
    await dialog.getByRole("button", { name: "Simpan undangan" }).click();
    await expect(dialog).toBeHidden();
    await admin.getByRole("button", { name: "Hapus Tamu Diperbarui", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Batal", exact: true })).toBeFocused();
    await admin.route(`${api}/*`, route => route.request().method() === "DELETE" ? route.abort("failed") : route.continue());
    await dialog.getByRole("button", { name: "Hapus undangan", exact: true }).click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await expect(dialog).toBeVisible();
    await admin.unroute(`${api}/*`);
    await dialog.getByRole("button", { name: "Hapus undangan", exact: true }).click();
    await expect(admin).toHaveURL(guests);
    await expect(admin.getByRole("link", { name: "Tamu Diperbarui", exact: true })).toHaveCount(0);

    await admin.getByRole("button", { name: "Impor CSV", exact: true }).click();
    await dialog.getByLabel("File CSV").setInputFiles({ name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from("guestName,guestQuota\nInvalid,0") });
    await dialog.getByRole("button", { name: "Lihat preview" }).click();
    await expect(dialog.getByRole("status")).toContainText("1 invalid");
    await expect(dialog.getByRole("button", { name: /Konfirmasi impor/ })).toBeDisabled();
    const longName = "Keluarga " + "Nusantara".repeat(15);
    const csv = "guestName,guestQuota\n" + [`${longName},4`, "Nama Kembar,2", "Nama Kembar,3", ...Array.from({ length: 42 }, (_, i) => `Undangan ${String(i).padStart(2, "0")},2`)].join("\n");
    await dialog.getByLabel("File CSV").setInputFiles({ name: "guests.csv", mimeType: "text/csv", buffer: Buffer.from(csv) });
    await dialog.getByRole("button", { name: "Lihat preview" }).click();
    await expect(dialog.getByRole("status")).toContainText("45 valid");
    await expect(dialog.getByRole("button", { name: /Konfirmasi impor/ })).toBeDisabled();
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: /Konfirmasi impor/ }).click();
    await expect(dialog).toBeHidden();
    await expect(admin.getByText("45 tamu berhasil diimpor.")).toBeVisible();
    await admin.goto(`${guests}?q=Nama+Kembar`);
    await expect(admin.getByRole("link", { name: "Nama Kembar", exact: true })).toHaveCount(2);
    await admin.goto(`${guests}?q=does-not-exist`);
    await expect(admin.getByRole("heading", { name: "Tidak ada tamu yang cocok" })).toBeVisible();
    await admin.getByRole("link", { name: "Reset filter", exact: true }).click();
    await expect(admin.getByRole("table").locator("tbody tr")).toHaveCount(20);
    await admin.getByRole("link", { name: "Berikutnya", exact: true }).click();
    await expect(admin).toHaveURL(/page=2/);
    await expect(admin.getByRole("table").locator("tbody tr")).toHaveCount(20);

    for (const width of [320, 390, 768, 1024, 1440]) {
      for (const page of [admin, staff, client, publicPage]) await page.setViewportSize({ width, height: 900 });
      await admin.goto(`${guests}?sort=name_asc`);
      await expect(admin.getByRole("link", { name: longName, exact: true })).toBeVisible();
      assert.ok(await admin.getByRole("link", { name: longName, exact: true }).evaluate(element => element.scrollWidth <= element.clientWidth), "Long name wraps within its cell");
      await fits(admin);
      if ([390, 1440].includes(width)) await capture(admin, `guests-${width}`);
      await admin.getByRole("button", { name: "Lihat QR", exact: true }).first().click();
      await expect(dialog.getByRole("img")).toBeVisible();
      await fits(admin);
      if ([390, 1440].includes(width)) await capture(admin, `qr-${width}`);
      await admin.keyboard.press("Escape");
      await expect(admin.getByRole("button", { name: "Lihat QR", exact: true }).first()).toBeFocused();
      await admin.getByRole("button", { name: "Tambah tamu", exact: true }).click();
      await fits(admin);
      await admin.keyboard.press("Escape");
      await admin.goto(`${base}/admin/events/${eventId}`);
      await expect(admin.getByRole("navigation", { name: "Navigasi acara" })).toBeVisible();
      await fits(admin);
      if ([390, 1440].includes(width)) await capture(admin, `event-${width}`);
      await staff.goto(`${base}/staff/events/${eventId}`);
      await expect(staff.getByRole("tab", { name: "Scan QR", exact: true })).toBeVisible();
      await fits(staff);
      if (width === 390) await capture(staff, "staff-390");
      await staff.getByRole("tab", { name: "Antrean pre-check-in", exact: true }).click();
      await expect(staff.getByRole("button", { name: "Muat ulang antrean" })).toBeEnabled();
      await fits(staff);
      await expect(staff.getByRole("link", { name: "Pengaturan", exact: true })).toHaveCount(0);
      await client.goto(`${base}/client/events/${eventId}`);
      await fits(client);
      await expect(client.getByRole("tab")).toHaveCount(0);
      await expect(client.getByRole("link", { name: "QR undangan", exact: true })).toHaveCount(0);
      await publicPage.goto(`${base}/e/${slug}/checkin`);
      await expect(publicPage.getByLabel("Nama pada undangan")).toBeVisible();
      await fits(publicPage);
      if (width === 390) await capture(publicPage, "welcome-390");
      console.log(`Sprint 2: guests, QR, event, staff, queue and public welcome fit ${width}px.`);
    }

    await admin.goto(guests);
    await admin.route("**/invitations/*/qr", route => route.abort("failed"));
    await admin.getByRole("button", { name: "Lihat QR", exact: true }).first().click();
    await expect(dialog.getByRole("alert")).toBeVisible();
    await admin.unroute("**/invitations/*/qr");
    await dialog.getByRole("button", { name: "Coba lagi" }).click();
    await expect(dialog.getByRole("img")).toBeVisible();
    await admin.keyboard.press("Escape");

    await publicPage.setViewportSize({ width: 390, height: 844 });
    await publicPage.clock.install();
    await publicPage.route("**/precheckin", route => route.abort("failed"));
    await publicPage.getByLabel("Nama pada undangan").fill("Nama Kembar");
    await publicPage.getByRole("button", { name: "Lanjut", exact: true }).click();
    await expect(publicPage.locator("form").getByRole("alert")).toBeVisible();
    await expect(publicPage.getByLabel("Nama pada undangan")).toHaveValue("Nama Kembar");
    await publicPage.unroute("**/precheckin");
    await publicPage.getByRole("button", { name: "Lanjut", exact: true }).click();
    const ticket = publicPage.getByRole("region", { name: "Tiket sementara" });
    await expect(ticket).toBeVisible();
    await expect(ticket.getByRole("heading")).toBeFocused();
    await expect(ticket.getByText("Tiket ini bukan bukti kehadiran. Verifikasi petugas tetap diperlukan.")).toBeVisible();
    const queueCode = await ticket.locator("p.font-mono").innerText();
    assert.match(queueCode, /^[A-F0-9]{8}$/);
    await capture(publicPage, "ticket-390");
    for (const width of [320, 390, 768, 1024, 1440]) { await publicPage.setViewportSize({ width, height: 844 }); await fits(publicPage); }
    await staff.setViewportSize({ width: 390, height: 844 });
    await staff.getByLabel("Kode antrean atau token sementara").fill(queueCode);
    await staff.getByRole("button", { name: "Buka tiket", exact: true }).click();
    await expect(staff.getByRole("button", { name: /^Nama Kembar/ })).toHaveCount(2);
    await capture(staff, "queue-390");
    await staff.getByRole("button", { name: "Tolak / batalkan tiket", exact: true }).click();
    dialog = staff.getByRole("dialog");
    await expect(dialog.getByRole("button", { name: "Batal", exact: true })).toBeFocused();
    await fits(staff);
    await dialog.getByRole("button", { name: "Batal", exact: true }).click();
    await expect(staff.getByRole("button", { name: "Tolak / batalkan tiket", exact: true })).toBeVisible();
    await staff.getByRole("button", { name: "Tolak / batalkan tiket", exact: true }).click();
    await dialog.getByRole("button", { name: "Ya, batalkan tiket", exact: true }).click();
    await expect(dialog).toBeHidden();
    await staff.getByLabel("Status antrean").selectOption("CANCELLED");
    await expect(staff.getByRole("button", { name: new RegExp(queueCode) })).toContainText("Dibatalkan");
    await publicPage.clock.fastForward(21 * 60 * 1000);
    await expect(ticket.getByText(/Masa berlaku tiket berakhir/)).toBeVisible();
    await publicPage.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await publicPage.locator("summary").evaluate(element => getComputedStyle(element).transitionDuration), "1e-05s");
    console.log("Sprint 2 interactions passed: CRUD, CSV errors/duplicates/success, pagination, QR/network recovery, role controls, ticket focus and queue cancellation.");
  } finally { await publicPage.close(); }
}
