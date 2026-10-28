import "server-only";
import { randomBytes } from "node:crypto";
import { formatEventDate } from "@/features/management/validation";
import { invitationPng } from "./qr";

type PrintableInvitation = {
  guestName: string; guestQuota: number; code: string;
  event: { name: string; eventDate: Date; location: string | null };
};

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!);
}

export async function invitationPrintResponse(invitation: PrintableInvitation) {
  const png = await invitationPng(invitation.code);
  const nonce = randomBytes(18).toString("base64");
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="no-referrer"><title>Undangan WedFlow</title>
<style nonce="${nonce}">
*{box-sizing:border-box}body{margin:0;background:#faf8f2;color:#123e32;font:16px/1.6 system-ui,sans-serif}main{max-width:640px;margin:32px auto;padding:16px}.tools{text-align:center;margin-bottom:24px}button{border:0;border-radius:8px;background:#123e32;color:white;font:inherit;padding:12px 24px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}article{background:white;border:1px solid #b49b64;border-radius:16px;padding:40px;text-align:center;overflow-wrap:anywhere}.brand{letter-spacing:.22em;color:#73603b;font-size:12px}h1{font-size:28px;line-height:1.3}h2{font-size:22px}img{display:block;width:280px;max-width:100%;height:auto;margin:20px auto}code{display:block;font-size:11px;overflow-wrap:anywhere;color:#222}.note{font-size:13px;color:#57534e}
@page{size:A4;margin:18mm}@media print{body{background:white;color:black}main{margin:0;padding:0;max-width:none}.tools{display:none!important}article{break-inside:avoid;border:1px solid #999;border-radius:0;max-width:160mm;margin:auto;padding:12mm}img{width:65mm;max-width:100%;print-color-adjust:exact;-webkit-print-color-adjust:exact}h1,h2{break-after:avoid}}
</style></head><body><main><div class="tools"><button id="print" disabled>Menyiapkan QR...</button><p id="print-status" role="status">Tunggu hingga QR siap sebelum mencetak.</p><p class="note">Nonaktifkan header/footer browser untuk hasil cetak bersih.</p></div><article aria-label="Undangan pernikahan"><p class="brand">WEDFLOW · UNDANGAN</p><h1>${escapeHtml(invitation.event.name)}</h1><p>Dengan hormat mengundang</p><h2>${escapeHtml(invitation.guestName)}</h2><p>Kuota: ${invitation.guestQuota} orang</p><img id="qr" src="data:image/png;base64,${png.toString("base64")}" width="1024" height="1024" alt="QR undangan"><code>${escapeHtml(invitation.code)}</code><p>${escapeHtml(formatEventDate(invitation.event.eventDate))}<br>${escapeHtml(invitation.event.location ?? "Lokasi akan diinformasikan")}</p><p class="note">Tunjukkan QR ini kepada petugas saat tiba di acara.<br>Satu undangan hanya dapat digunakan untuk satu kali check-in.</p></article></main>
<script nonce="${nonce}">const button=document.getElementById('print');const status=document.getElementById('print-status');document.getElementById('qr').decode().then(()=>{button.disabled=false;button.textContent='Print undangan';status.textContent='QR siap dicetak.'}).catch(()=>{status.textContent='QR gagal dimuat. Muat ulang halaman sebelum mencetak.'});button.addEventListener('click',()=>window.print());</script></body></html>`;
  return new Response(html, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer",
    "X-Frame-Options": "DENY",
    "Content-Security-Policy": `default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  } });
}
