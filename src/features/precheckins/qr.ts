import "server-only";
import QRCode from "qrcode";
import { randomBytes } from "node:crypto";
import { publicOrigin } from "./ticket";
import { slugSchema } from "./validation";

export const publicCheckinUrl = (slug: string) => `${publicOrigin()}/e/${slugSchema.parse(slug)}/checkin`;
export const publicQrPng = (slug: string) => QRCode.toBuffer(publicCheckinUrl(slug), { type: "png", width: 1024, margin: 4, errorCorrectionLevel: "M" });
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export async function publicQrPrint(event: { name: string; slug: string }) {
  const png = await publicQrPng(event.slug);
  const nonce = randomBytes(18).toString("base64");
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>QR umum WedFlow</title><style nonce="${nonce}">
  *{box-sizing:border-box}body{margin:0;background:#faf8f2;color:#123e32;font:18px/1.5 system-ui}main{max-width:640px;margin:24px auto;padding:24px;text-align:center;border:1px solid #b49b64}img{width:320px;max-width:100%;height:auto}h1{overflow-wrap:anywhere}button{padding:16px;background:#123e32;color:white;border:0;border-radius:8px;font:inherit}button:disabled{opacity:.5}a{overflow-wrap:anywhere;color:inherit}@media print{button,#status{display:none}body{background:white}main{margin:0 auto;border:0}img{width:85mm}}</style></head><body><main><p>WEDFLOW</p><h1>${escapeHtml(event.name)}</h1><h2>Lupa QR undangan?</h2><p>Pindai QR ini, isi nama undangan, lalu tunjukkan kode antrean kepada petugas.</p><img id="qr" width="1024" height="1024" alt="QR pre-check-in acara" src="data:image/png;base64,${png.toString("base64")}"><p><a href="${escapeHtml(publicCheckinUrl(event.slug))}">${escapeHtml(publicCheckinUrl(event.slug))}</a></p><p>Verifikasi petugas tetap diperlukan sebelum kehadiran dicatat.</p><button id="print" disabled>Cetak QR umum</button><p id="status" role="status">Menyiapkan QR...</p></main><script nonce="${nonce}">const b=document.getElementById('print');const s=document.getElementById('status');document.getElementById('qr').decode().then(()=>{b.disabled=false;s.textContent='QR siap dicetak.'}).catch(()=>{s.textContent='QR gagal dimuat. Muat ulang halaman.'});b.addEventListener('click',()=>window.print());</script></body></html>`, { headers: {
    "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Frame-Options": "DENY",
    "Content-Security-Policy": `default-src 'none'; img-src data:; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`,
  } });
}
