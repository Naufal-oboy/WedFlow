import assert from "node:assert/strict";
import { chromium, expect } from "@playwright/test";
import QRCode from "qrcode";
import { prisma } from "../src/lib/prisma";

type CameraHarness = { denied: boolean; showQr: boolean; streams: MediaStream[]; calls: number; failures: string[]; delay: number };
type HarnessWindow = Window & { cameraHarness: CameraHarness };

export async function testCheckinBrowser({ base, eventId, invitation, cookies }: {
  base: string; eventId: string; invitation: { id: string; code: string; guestName: string }; cookies: Map<string, string>;
}) {
  const browser = await chromium.launch({ channel: process.env.QR_BROWSER_CHANNEL || "msedge", headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.addCookies([...cookies].map(([name, value]) => ({ name, value, url: base, httpOnly: true, sameSite: "Lax" as const })));
    // Raw browser script avoids tsx/esbuild's __name helper in serialized functions.
    const png = await QRCode.toDataURL(invitation.code, { width: 380, margin: 4 });
    await context.addInitScript({ content: `(() => {
      const png = ${JSON.stringify(png)};
      const harness = { denied: true, showQr: false, streams: [], calls: 0, failures: [], delay: 0 };
      window.cameraHarness = harness;
      Object.defineProperty(navigator.mediaDevices, "getUserMedia", { value: async () => {
        harness.calls++;
        if (harness.delay) await new Promise((resolve) => setTimeout(resolve, harness.delay));
        if (harness.denied) throw new DOMException("Denied in test", "NotAllowedError");
        const canvas = document.createElement("canvas"); canvas.width = 640; canvas.height = 640;
        const ctx = canvas.getContext("2d");
        const image = new Image();
        if (harness.showQr) {
          image.src = png; await image.decode();
        }
        let stream;
        try { stream = canvas.captureStream(10); } catch (error) { harness.failures.push(String(error)); throw error; }
        harness.streams.push(stream);
        // A camera continuously produces frames; repaint after capture starts so
        // the browser can fire video metadata/playing events even for blank input.
        const timer = setInterval(() => {
          if (stream.getTracks().every((track) => track.readyState === "ended")) { clearInterval(timer); return; }
          ctx.fillStyle = "white"; ctx.fillRect(0, 0, 640, 640);
          if (image.complete && image.naturalWidth) ctx.drawImage(image, 130, 130, 380, 380);
        }, 100);
        return stream;
      } });
      Object.defineProperty(navigator.mediaDevices, "enumerateDevices", { value: async () => [{ deviceId: "rear", kind: "videoinput", label: "Rear test camera" }, { deviceId: "front", kind: "videoinput", label: "Front test camera" }] });
    })();` });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(`${base}/staff/events/${eventId}`);
    const dashboard = page.getByRole("region", { name: "Check-in tamu", exact: true });
    const ready = async () => {
      try { await expect(page.getByText("Arahkan QR ke dalam area pemindaian.")).toBeVisible(); }
      catch (error) {
        console.error("Camera test diagnostics:", errors, await page.getByRole("region", { name: "Pemindai QR" }).getByRole("status").allTextContents(), await page.evaluate(() => ({ calls: (window as unknown as HarnessWindow).cameraHarness.calls, denied: (window as unknown as HarnessWindow).cameraHarness.denied, failures: (window as unknown as HarnessWindow).cameraHarness.failures, videos: [...document.querySelectorAll("video")].map((video) => ({ width: video.videoWidth, height: video.videoHeight, state: video.readyState })), streams: (window as unknown as HarnessWindow).cameraHarness.streams.map((stream) => stream.getTracks().map((track) => track.readyState)) })));
        throw error;
      }
    };
    await dashboard.getByRole("button", { name: "Aktifkan kamera" }).click();
    await expect(page.getByText(/Kamera tidak dapat dibuka/)).toBeVisible();
    await dashboard.getByLabel("Kode undangan manual").fill(invitation.code);
    await dashboard.getByRole("button", { name: "Verifikasi kode", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText(invitation.guestName, { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Konfirmasi check-in", exact: true })).toBeDisabled();
    assert.equal(await prisma.checkinLog.count({ where: { invitationId: invitation.id } }), 0, "Manual verification never writes attendance");
    await dialog.getByRole("checkbox").check();
    // Lose a successful response after the database committed, then retry.
    let loseResponse = true;
    await page.route("**/api/checkins", async (route) => {
      if (route.request().method() === "POST" && loseResponse) {
        loseResponse = false;
        const response = await route.fetch();
        assert.equal(response.status(), 201);
        await route.abort("failed");
      } else await route.continue();
    });
    await dialog.getByRole("button", { name: "Konfirmasi check-in", exact: true }).click();
    await expect(dialog.getByRole("button", { name: "Coba ulang transaksi" })).toBeEnabled();
    await expect(dialog.getByLabel("Jumlah yang datang sekarang")).toBeDisabled();
    await dialog.getByRole("button", { name: "Coba ulang transaksi" }).click();
    await expect(dialog).not.toBeVisible();
    assert.equal(await prisma.checkinLog.count({ where: { invitationId: invitation.id } }), 1, "Lost response retry does not duplicate arrival");

    await page.evaluate(() => { (window as unknown as HarnessWindow).cameraHarness.denied = false; });
    const assertStopped = async () => expect.poll(() => page.evaluate(() => (window as unknown as HarnessWindow).cameraHarness.streams.every((stream) => stream.getTracks().every((track) => track.readyState === "ended")))).toBe(true);
    await dashboard.getByRole("button", { name: "Aktifkan kamera" }).click();
    await ready();
    await expect(page.getByLabel("Pilih kamera")).toBeVisible();
    await page.getByLabel("Pilih kamera").selectOption("front");
    await ready();
    await dashboard.getByRole("button", { name: "Tutup kamera" }).click();
    await assertStopped();
    await dashboard.getByRole("button", { name: "Aktifkan kamera" }).click();
    await ready();
    await dashboard.getByRole("button", { name: "Cari Nama", exact: true }).click();
    await assertStopped();
    await dashboard.getByRole("button", { name: "Scan QR", exact: true }).click();
    await dashboard.getByRole("button", { name: "Aktifkan kamera" }).click();
    await ready();
    await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
    await assertStopped();

    const beforeDelayed = await page.evaluate(() => {
      const harness = (window as unknown as HarnessWindow).cameraHarness;
      harness.delay = 500;
      return { calls: harness.calls, streams: harness.streams.length };
    });
    await dashboard.getByRole("button", { name: "Aktifkan kamera" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as HarnessWindow).cameraHarness.calls)).toBeGreaterThan(beforeDelayed.calls);
    await dashboard.getByRole("button", { name: "Tutup kamera" }).click();
    await expect.poll(() => page.evaluate(() => (window as unknown as HarnessWindow).cameraHarness.streams.length)).toBeGreaterThan(beforeDelayed.streams);
    await assertStopped();
    await page.evaluate(() => { (window as unknown as HarnessWindow).cameraHarness.delay = 0; });

    await page.evaluate(() => { (window as unknown as HarnessWindow).cameraHarness.showQr = true; });
    await dashboard.getByRole("button", { name: "Aktifkan kamera" }).click();
    await expect(dialog.getByText(invitation.guestName, { exact: true })).toBeVisible({ timeout: 15000 });
    await assertStopped();
    assert.equal(await prisma.checkinLog.count({ where: { invitationId: invitation.id } }), 1, "Actual camera QR decoder only verifies");
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Konfirmasi check-in", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    await dashboard.getByRole("button", { name: "Cari Nama", exact: true }).click();
    await dashboard.getByLabel("Nama tamu", { exact: true }).fill("Browser Famly");
    await dashboard.getByRole("button", { name: new RegExp(invitation.guestName) }).click();
    await expect(dialog.getByText(invitation.guestName, { exact: true })).toBeVisible();
    await dialog.getByRole("checkbox").check();
    await dialog.getByRole("button", { name: "Konfirmasi check-in", exact: true }).click();
    await expect(dialog).not.toBeVisible();
    const arrivals = await prisma.checkinLog.findMany({ where: { invitationId: invitation.id } });
    assert.equal(arrivals.length, 3);
    assert.deepEqual(arrivals.map((arrival) => arrival.method).sort(), ["MANUAL", "NAME_SEARCH", "QR"]);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "Mobile dashboard has no horizontal overflow");
    assert.deepEqual(errors, [], "No unhandled browser exceptions");
    await context.close();
    console.log("Check-in browser passed: mobile, denied camera/manual fallback, explicit confirmation, lost-response retry, camera selection/close/tab/pagehide, real QR decoding, fuzzy search.");
  } finally { await browser.close(); }
}
