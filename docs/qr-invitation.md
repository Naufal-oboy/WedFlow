# QR Invitation Generation

## Audit dan keputusan implementasi

Branch implementasi: `feature/qr-invitation`. Acuan: [README](../README.md),
[PRD](../PRD.md), [schema](../prisma/schema.prisma), autentikasi dan check-in yang
sudah tersedia. Pada checkout awal, Guest Management baru berupa daftar baca
di detail event; belum ada API pembuatan/edit undangan atau impor CSV. Karena itu
sprint ini menambahkan fondasi minimum tambah/edit dan impor CSV, menggunakan
model `Invitation` yang sama. Tidak ada model, kolom, migrasi database, atau sistem
autentikasi baru. Penghapusan tamu dan XLSX tidak ditambahkan.

`Invitation.code` sudah memiliki constraint `@unique` dan dipakai oleh
`POST /api/checkins`. Field tersebut cukup untuk identitas QR: tidak perlu
`qrToken`, `qrUrl`, maupun menyimpan gambar ke database/storage publik.

## Arsitektur dan format payload

- [qr.ts](../src/features/invitations/qr.ts): generator token dan renderer PNG
  server-only menggunakan library `qrcode` yang sudah terpasang.
- [qr-access.ts](../src/features/invitations/qr-access.ts): pemeriksaan session,
  role, UUID route, dan pasangan `eventId + invitationId` sebelum membaca kode.
- [qr-actions.tsx](../src/features/invitations/qr-actions.tsx): komponen reusable
  untuk preview dialog, download, dan tautan cetak.
- [print.ts](../src/features/invitations/print.ts): dokumen cetak mandiri tanpa
  sidebar/navigation dashboard, dengan QR PNG yang sama.

Payload adalah **string kode undangan saja**:

```text
WF-<64 karakter heksadesimal lowercase dari 32 byte acak>
```

Generator menggunakan `node:crypto.randomBytes(32)` (256 bit). Token dibuat satu
kali di server saat menyimpan tamu, baik individual maupun impor. Constraint unik
database merupakan jaminan terakhir terhadap collision; transaksi gagal jika ada
duplikasi, tidak menimpa undangan lain. Tidak ada nama, email, telepon, nama event,
URL, atau JSON tambahan dalam payload. QR bukan tautan publik, sehingga tidak ada
origin/host tujuan QR untuk dikonfigurasi. Konfigurasi `AUTH_URL` yang sudah ada
tetap dipakai untuk perlindungan origin operasi tulis.

### Kode lama

Checkout awal tidak memiliki generator kode undangan aplikasi yang bisa diaudit;
fixture pengujian lama memakai kode arbitrer. Kode baru selalu memenuhi format
di atas. Membuka QR tidak pernah mengganti kode yang sudah disimpan. Jika record
lama tidak memenuhi format aman, endpoint QR/print menolak dengan `409` agar
nama, kontak, URL, atau kode lemah tidak ikut dicetak sebagai QR. Administrator
perlu meninjau dan merencanakan migrasi kode lama secara eksplisit sebelum
mendistribusikan QR untuk record tersebut. Fitur ini **tidak melakukan rotasi
massal otomatis**, karena dapat membatalkan undangan yang sudah dibagikan.
API check-in lama tetap menerima kode yang telah digunakan sebelumnya.

## Endpoint dan akses

Semua endpoint berikut hanya untuk session `SUPER_ADMIN` yang valid:

| Metode dan path (prefix `/api/admin/events/:eventId`) | Fungsi |
| --- | --- |
| `POST /invitations` | Tambah nama dan kuota; kode dibuat server |
| `PATCH /invitations/:invitationId` | Edit nama/kuota sebelum check-in; kode tetap |
| `POST /invitations/import` | Impor CSV melalui multipart field `file` |
| `GET /invitations/:invitationId/qr` | Detail terbaru dan PNG data URL untuk preview |
| `GET /invitations/:invitationId/qr?download=1` | Attachment PNG |
| `GET /invitations/:invitationId/print` | HTML cetak terproteksi |

Anonymous mendapat `401`; client/staff mendapat `403`, termasuk staff yang
ditugaskan ke event tersebut. Pasangan ID undangan dan event yang tidak cocok
menghasilkan `404`, termasuk ketika peminta adalah Super Admin. Admin boleh
mengelola semua event, tetapi tidak boleh memakai ID undangan event A lewat path
event B. Kode bukan pengganti autentikasi untuk mengakses endpoint ini.

Semua respons API sensitif memakai `Cache-Control: private, no-store`. QR tidak
disajikan melalui image optimizer, CDN publik, localStorage, maupun layanan QR
eksternal. Setiap download/print memeriksa izin kembali. Preview mengambil data
baru setiap dibuka dan menghapus state preview saat dialog ditutup. Dokumen cetak
memiliki CSP dengan nonce, escaping HTML, `nosniff`, `no-referrer`, dan larangan
embedding frame.

## Penggunaan dan integrasi Guest Management

1. Login sebagai Super Admin, buka detail event, pilih **Kelola tamu & QR**.
2. Tambah tamu atau impor CSV. Kode tersimpan bersama record; tidak perlu tombol
   generate terpisah. Gambar QR dirender sesuai kebutuhan dari kode yang sama.
3. Pilih **Lihat QR** pada daftar tamu. Dialog menampilkan nama event/tamu, kuota,
   status kehadiran, kode, QR, tanggal/waktu WIB, dan lokasi.
4. Edit nama/kuota tidak mengganti token. Undangan yang sudah check-in tidak bisa
   diedit melalui alur ini, sehingga data kehadiran tidak tertimpa.
5. Daftar menyediakan pagination dan filter nama biasa, bukan Smart Name Search
   untuk verifikasi/check-in.

Contoh CSV UTF-8:

```csv
guestName,guestQuota
Rani,1
"Keluarga Budi, Jakarta",4
```

Impor menyediakan preview sebelum konfirmasi, validasi server, batas ukuran dan
jumlah baris, serta penolakan batch bila ada baris invalid. Kode dari CSV tidak
dipercaya atau diterima sebagai identitas. Setiap baris valid mendapat token baru.
Jangan mengimpor file yang sama lagi setelah sukses: ini bukan mekanisme upsert
atau sinkronisasi daftar tamu.

## Download PNG dan print

PNG berukuran 1024 × 1024 px, hitam di atas putih opaque, quiet zone empat modul,
dan error correction M. File bernama `wedflow-invitation-<UUID undangan>.png`;
nama tamu dan token tidak dipakai sebagai nama file. Tidak ada metadata teks/EXIF
tamu. Mengunduh ulang menghasilkan gambar identik dari kode tersimpan.

**Print undangan** membuka tab berizin dengan kartu sederhana: event, tamu,
kuota, QR, kode, tanggal/waktu dan lokasi. Tombol cetak aktif setelah gambar
berhasil di-decode. CSS `@media print` menyembunyikan kontrol, memakai margin A4,
dan menghindari pemotongan kartu. Matikan header/footer browser untuk hasil
bersih. Browser dapat mencetak ke printer atau menyimpan PDF. Membuka/menutup
dialog cetak tidak dicatat sebagai bukti bahwa printer fisik berhasil mencetak.

## Integrasi check-in

Tidak ada perubahan kontrak [endpoint check-in](../src/app/api/checkins/route.ts).
Hasil decode QR dapat dikirim langsung sebagai `code`:

```json
{ "eventId": "UUID event yang dipilih petugas", "code": "WF-...", "count": 2 }
```

Server tetap memeriksa session admin/staff, penugasan staff, event dan client
aktif, kode yang cocok dengan event, dan kuota. Update bersyarat terhadap
`checkedInAt: null` dilakukan atomik di database. Dua permintaan simultan dengan
token sama menghasilkan satu sukses `201` dan satu konflik `409`; replay juga
ditolak. Token tetap sama setelah check-in, tetapi tidak dapat dipakai kembali.

PRD membahas kemungkinan kehadiran bertahap; implementasi check-in saat ini adalah
**sekali per undangan**, sesuai scope sprint dan endpoint yang sudah berjalan.
Sisa kuota setelah check-in parsial tidak dapat dipakai untuk check-in kedua.
Tidak ada scanner kamera, Smart Name Search, public pre-check-in, dashboard
real-time, payment, atau designer undangan dalam perubahan ini.

## Pengujian

```sh
npm run test:qr
npm run test:auth
npm run test:management
npm run typecheck
npm run lint
npm run build
```

Unit test memeriksa 10.000 token unik, format token, PNG 1024 px, payload melalui
decoder independen `jsqr`, stabilitas gambar, tidak adanya metadata pribadi,
nama file aman, escaping HTML cetak dan print stylesheet.

Pengujian integrasi memakai PostgreSQL lokal dan fixture sementara dengan UUID
unik. Gunakan database development/test, bukan produksi. Script membersihkan
record hanya di event/client/user fixture yang dibuat sendiri, termasuk saat
assertion gagal. Tidak mencetak password/cookie/koneksi database.

Terminal server (PowerShell):

```powershell
$env:AUTH_URL='http://localhost:3100'
npm run start -- --port 3100
```

Terminal pengujian:

```powershell
$env:AUTH_TEST_URL='http://localhost:3100'
$env:QR_BROWSER_TESTS='1'
$env:QR_BROWSER_CHANNEL='msedge'
npm run test:auth:e2e
```

Browser test memakai Playwright dengan Microsoft Edge yang sudah terpasang;
`QR_BROWSER_CHANNEL=chrome` dapat dipakai bila Chrome tersedia. Untuk menjalankan
HTTP-only, hapus `QR_BROWSER_TESTS`. Tidak ada browser yang perlu dipakai oleh
aplikasi production; Playwright, `jsqr`, dan `pngjs` langsung adalah devDependencies.

Integrasi HTTP menguji create/edit, refresh, identitas tetap, constraint unik
database, PNG yang bisa di-decode, HTML cetak, akses seluruh role, ID lintas event,
kode legacy, impor CSV, kuota, dan dua check-in konkuren. Browser menguji preview
di viewport mobile, refresh, download file nyata, tombol print, CSS print, serta
render PDF satu halaman. Pengujian ini tidak mengoperasikan printer fisik.

### Hasil verifikasi implementasi

Pada 28 Oktober 2026, branch `feature/qr-invitation`: 8 tes QR/CSV,
6 tes auth, 5 tes management, TypeScript, lint, dan build production lulus.
Suite HTTP auth/management (141 assertions) beserta pengujian tambahan QR
dan browser Edge headless lulus, termasuk PDF satu halaman dan check-in
konkuren. Fixture sementara telah dibersihkan setelah pengujian.
