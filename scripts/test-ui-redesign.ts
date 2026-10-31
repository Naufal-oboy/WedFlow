import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { chromium, expect, type Page, type BrowserContext } from "@playwright/test";
import { prisma } from "../src/lib/prisma";
import { hashPassword } from "../src/features/auth/password";
import { generateInvitationCode } from "../src/features/invitations/qr";

const base = process.env.AUTH_TEST_URL ?? "http://localhost:3100";
if (!["localhost", "127.0.0.1"].includes(new URL(base).hostname)) throw new Error("Use a local test server.");
const prefix = `ui-test-${randomUUID()}`;
const clientId = randomUUID(), eventId = randomUUID();
const userIds = [randomUUID(), randomUUID(), randomUUID()];
const password = randomBytes(24).toString("base64url");
const code = generateInvitationCode();
const errors: string[] = [];
let checks = 0;
function check(value: unknown, message: string) { assert.ok(value, message); checks++; }
async function fits(page: Page, label: string) {
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}: no viewport overflow`);
}
async function login(context: BrowserContext, index: number) {
  const { csrfToken } = await (await context.request.get(`${base}/api/auth/csrf`)).json();
  await context.request.post(`${base}/api/auth/callback/credentials`, { headers: { Origin: base, "X-Auth-Return-Redirect": "1" }, form: { csrfToken, email: `${prefix}-${index}@example.invalid`, password } });
  check((await (await context.request.get(`${base}/api/auth/session`)).json()).user?.id === userIds[index], "Fixture authentication");
}
function contrast(a: string, b: string) {
  const luminance = (hex: string) => {
    const raw = hex.replace("#", "");
    const expanded = raw.length === 3 ? [...raw].map(value => value + value).join("") : raw;
    const rgb = expanded.match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  };
  const x = luminance(a), y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}
async function main() {
  await prisma.client.create({ data: { id: clientId, name: "Alya & Raka", status: "ACTIVE" } });
  const passwordHash = await hashPassword(password);
  for (const [index, role] of (["SUPER_ADMIN", "CLIENT", "STAFF"] as const).entries()) {
    await prisma.user.create({ data: { id: userIds[index], name: ["Nadia", "Alya", "Dimas"][index], email: `${prefix}-${index}@example.invalid`, passwordHash, role, ...(role === "CLIENT" ? { clientId } : {}) } });
  }
  await prisma.event.create({ data: { id: eventId, clientId, name: "The Wedding of Alya & Raka", slug: prefix, eventDate: new Date(Date.now() + 7 * 86400_000), location: "The Glass House, Jakarta", status: "ACTIVE" } });
  await prisma.eventStaff.create({ data: { eventId, userId: userIds[2] } });
  await prisma.invitation.create({ data: { eventId, guestName: "Keluarga Pratama", guestQuota: 4, code } });
  const browser = await chromium.launch({ channel: process.env.QR_BROWSER_CHANNEL || "msedge", headless: true });
  try {
    const contexts = await Promise.all(userIds.map(() => browser.newContext({ viewport: { width: 1440, height: 1000 } })));
    for (const [index, context] of contexts.entries()) await login(context, index);
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    pages.forEach(page => page.on("pageerror", error => errors.push(error.message)));
    const [admin, client, staff] = pages;
    const cases: [Page, string, string][] = [[admin, "/admin", "admin"], [admin, "/admin/events", "events"], [admin, "/admin/clients", "clients"], [admin, "/admin/users", "users"], [admin, "/admin/staff", "assignments"], [admin, "/admin/clients/new", "client-form"], [admin, "/admin/events/new", "event-form"], [admin, `/admin/events/${eventId}/guests`, "guests"], [client, "/client", "client"], [client, `/client/events/${eventId}`, "client-event"], [staff, "/staff", "staff"], [staff, `/staff/events/${eventId}`, "checkin"]];
    for (const width of [1440, 768, 390, 320]) {
      for (const [page, route, label] of cases) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${base}${route}`);
        await expect(page.locator("main h1")).toBeVisible();
        await fits(page, `${label} ${width}`);
        if (width < 1024) {
          const trigger = page.getByRole("button", { name: "Buka navigasi" });
          await trigger.click();
          const dialog = page.getByRole("dialog");
          await expect(dialog).toBeVisible();
          await expect(dialog.getByRole("navigation")).toBeVisible();
          await page.keyboard.press("Escape");
          await expect(dialog).toBeHidden();
          await expect(trigger).toBeFocused();
          checks += 3;
        }
      }
      console.log(`Responsive layouts and mobile navigation passed: ${width}px.`);
    }
    await staff.setViewportSize({ width: 390, height: 844 });
    const qrTab = staff.getByRole("tab", { name: "Scan QR", exact: true });
    await qrTab.focus();
    await staff.keyboard.press("ArrowRight");
    const nameTab = staff.getByRole("tab", { name: "Cari Nama", exact: true });
    await expect(nameTab).toBeFocused();
    await staff.keyboard.press("Enter");
    await expect(nameTab).toHaveAttribute("aria-selected", "true");
    await staff.getByLabel("Nama tamu", { exact: true }).fill("Pratama");
    await staff.getByRole("button", { name: /^Keluarga Pratama/ }).click();
    const verification = staff.getByRole("dialog");
    await expect(verification).toBeVisible();
    await expect(verification.getByRole("button", { name: "Konfirmasi check-in", exact: true })).toBeDisabled();
    await verification.getByRole("checkbox").check();
    await verification.getByLabel("Jumlah yang datang sekarang").fill("5");
    await expect(verification.getByRole("button", { name: "Konfirmasi check-in", exact: true })).toBeDisabled();
    await verification.getByLabel("Jumlah yang datang sekarang").fill("1");
    await expect(verification.getByRole("button", { name: "Konfirmasi check-in", exact: true })).toBeEnabled();
    for (let i = 0; i < 12; i++) {
      await staff.keyboard.press("Tab");
      await expect.poll(() => verification.evaluate(element => element.contains(document.activeElement))).toBe(true);
      checks++;
    }
    for (const width of [320, 390, 768, 1440]) { await staff.setViewportSize({ width, height: 700 }); await fits(staff, `dialog ${width}`); }
    await staff.keyboard.press("Escape");
    await expect(verification).toBeHidden();
    check(await prisma.checkinLog.count({ where: { eventId } }) === 0, "UI verification never records attendance without submit");
    await admin.goto(`${base}/admin/clients/new`);
    await admin.locator('button[type="submit"]').click();
    check(await admin.locator("input:invalid").count() > 0, "Required form validation remains active");
    await staff.goto(`${base}/staff`);
    await staff.setViewportSize({ width: 1440, height: 900 });
    await staff.getByRole("navigation", { name: "Navigasi dashboard" }).getByRole("link", { name: "Acara", exact: true }).click();
    await expect(staff.getByRole("navigation", { name: "Navigasi dashboard" }).getByRole("link", { name: "Acara", exact: true })).toHaveAttribute("aria-current", "page");
    await staff.getByRole("button", { name: "Menu akun Dimas" }).click();
    await expect(staff.getByRole("button", { name: "Keluar", exact: true })).toBeVisible();
    await staff.keyboard.press("Escape");
    await staff.goto(`${base}/staff`);
    await expect(staff.locator("main h1")).toBeVisible();
    // Next restores focus after navigation; start this check at the skip link.
    await staff.getByRole("link", { name: "Lewati ke konten utama" }).focus();
    await expect(staff.getByRole("link", { name: "Lewati ke konten utama" })).toBeFocused();
    check(await staff.getByRole("link", { name: "Lewati ke konten utama" }).evaluate(element => getComputedStyle(element).outlineStyle !== "none"), "Visible keyboard focus");
    await staff.keyboard.press("Enter");
    await expect(staff.locator("#main-content")).toBeFocused();
    const tokens = await staff.evaluate(() => Object.fromEntries(["primary", "primary-foreground", "background", "foreground", "muted-foreground", "card", "success", "success-soft", "warning", "warning-soft"].map(name => [name, getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim()])));
    for (const [fg, bg] of [["primary", "primary-foreground"], ["foreground", "background"], ["muted-foreground", "background"], ["muted-foreground", "card"], ["success", "success-soft"], ["warning", "warning-soft"]]) check(contrast(tokens[fg], tokens[bg]) >= 4.5, `${fg}/${bg} WCAG AA text contrast`);
    if (process.env.UI_SCREENSHOTS) {
      await mkdir("docs/ui-redesign", { recursive: true });
      for (const [page, route, label, width] of [[admin, "/admin", "admin-desktop", 1440], [client, "/client", "client-desktop", 1440], [staff, "/staff", "staff-mobile", 390], [staff, `/staff/events/${eventId}`, "checkin-mobile", 390]] as const) {
        await page.setViewportSize({ width, height: 1000 }); await page.goto(`${base}${route}`); await expect(page.locator("main h1")).toBeVisible(); await page.evaluate(() => document.fonts.ready);
        await page.screenshot({ path: `docs/ui-redesign/${label}.png`, fullPage: true });
      }
    }
    await prisma.eventStaff.deleteMany({ where: { eventId } });
    await staff.goto(`${base}/staff`);
    await expect(staff.getByText("Belum ada acara untuk ditampilkan")).toBeVisible();
    check(errors.length === 0, `No browser exceptions: ${errors.join("; ")}`);
    console.log(`UI redesign: ${checks} assertions plus browser expectations passed; 1440/768/390/320px, navigation, focus, dialog, validation, contrast, empty state.`);
  } finally { await browser.close(); }
}
main().finally(async () => {
  await prisma.precheckinRequest.deleteMany({ where: { eventId } });
  await prisma.checkinLog.deleteMany({ where: { eventId } });
  await prisma.invitation.deleteMany({ where: { eventId } });
  await prisma.eventStaff.deleteMany({ where: { eventId } });
  await prisma.event.deleteMany({ where: { id: eventId } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.client.deleteMany({ where: { id: clientId } });
  await prisma.$disconnect();
}).catch(error => { console.error(error); process.exitCode = 1; });
