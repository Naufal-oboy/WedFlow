# Guest & Invitation Management

Modul ini memakai model `Invitation` yang sudah tersedia, Auth.js v5, Prisma 7,
PostgreSQL, dan komponen shadcn/ui Base UI. Tidak ada model baru, migrasi, atau
perubahan logika check-in. Pengelolaan undangan hanya tersedia untuk Super Admin.

## Fitur dan alur penggunaan

1. Buka detail acara, lalu **Kelola tamu & undangan**.
2. Daftar pada `/admin/events/[eventId]/guests` menampilkan nama, kode, kuota,
   status, jumlah hadir, waktu check-in dalam WIB, dan aksi.
3. Cari nama/kode tanpa membedakan huruf besar/kecil; filter sudah/belum hadir.
   Urutkan nama A–Z/Z–A atau waktu dibuat terbaru/terlama. Pagination 20 baris
   dilakukan di database, mempertahankan filter, dan memakai ID sebagai
   pengurutan tambahan agar hasil stabil. Halaman di luar rentang dijepit ke
   halaman terakhir.
4. **Tambah tamu** menyimpan nama dan kuota, membuat kode acak, lalu menampilkan
   toast. Nama sama diperbolehkan sebagai undangan terpisah.
5. **Edit** hanya mengubah nama/kuota. Kode dan informasi check-in tetap.
6. **Detail** membuka `/admin/events/[eventId]/guests/[guestId]`, termasuk nama
   acara dan petugas check-in. Email/password petugas tidak disertakan.
7. **Hapus** membutuhkan dialog konfirmasi dan hanya diizinkan sebelum check-in.
8. **Lihat QR**, **Download QR**, dan **Print undangan** tersedia pada daftar dan
   detail. QR memakai kode tersimpan tanpa rotasi, termasuk kode hasil impor.
   Lihat [panduan QR Invitation](./qr-invitation.md).

Tersedia skeleton, empty state, penanganan error/retry, pending state, validasi
field, tabel yang dapat digulir horizontal, serta navigasi kembali ke acara.
Warna dan komponen mengikuti tema emerald, ivory, dan champagne WedFlow.

## Struktur file

| Area | File |
| --- | --- |
| Validasi | [validation.ts](../src/features/guests/validation.ts): schema Zod, normalisasi, batas input/filter |
| CSV | [csv.ts](../src/features/guests/csv.ts): parser, nomor baris, validasi, preview aman |
| Database | [service.ts](../src/features/guests/service.ts): scope admin/event, query, CRUD atomik, transaksi impor |
| Token preview | [import-token.ts](../src/features/guests/import-token.ts): HMAC, masa berlaku, pengikatan file/event/akun |
| Request | [request.ts](../src/features/guests/request.ts): pembatasan byte body dan decoding UTF-8 |
| UI server | [guest-pages.tsx](../src/features/guests/guest-pages.tsx): tabel, filter, pagination, detail |
| UI interaktif | [guest-actions.tsx](../src/features/guests/guest-actions.tsx), [import-dialog.tsx](../src/features/guests/import-dialog.tsx) |
| Halaman | [guests/](../src/app/admin/events/[eventId]/guests/): daftar, detail, loading, error |
| API | [API guests/](../src/app/api/admin/events/[eventId]/guests/) |
| Integrasi acara | [event-detail.tsx](../src/components/dashboard/event-detail.tsx): tautan pengelolaan tamu |
| Pengujian | [guests.test.ts](../tests/guests.test.ts), [test-guests-e2e.ts](../scripts/test-guests-e2e.ts) |

## API

Semua endpoint di bawah memerlukan sesi `SUPER_ADMIN`. Mutasi memerlukan
header `Origin` yang sesuai dengan `AUTH_URL`. Body POST/PATCH berupa JSON.
Respons memakai `Cache-Control: private, no-store` dan error handler bersama.
ID event/undangan divalidasi sebagai UUID; undangan selalu dicari berdasarkan
gabungan ID undangan dan ID event. Pemeriksaan dilakukan di server, termasuk
ketika request dikirim langsung tanpa UI.

Prefix: `/api/admin/events/:eventId/guests`

| Metode | Endpoint | Input / hasil |
| --- | --- | --- |
| GET | prefix | `q`, `attendance=present/absent`, `sort=name_asc/name_desc/created_asc/created_desc`, `page`; hasil `{ event, guests, total, page, pageSize }` |
| POST | prefix | `{ guestName, guestQuota }`; 201 `{ guest }` |
| GET | `/:guestId` | `{ event, guest }`, termasuk `checkedInBy: { id, name }` atau null |
| PATCH | `/:guestId` | `{ guestName, guestQuota }`; `{ guest }` |
| DELETE | `/:guestId` | Tanpa body; `{ success: true }` |
| POST | `/import` | Preview atau konfirmasi seperti di bawah |

Kode respons: 400 input tidak valid, 401 belum login, 403 role/origin ditolak,
404 resource tidak ditemukan pada event tersebut, 409 konflik integritas atau
preview, 413 body terlalu besar, 415 content type salah. Error memakai
`{ error, fields? }`; kesalahan baris CSV terdapat dalam hasil preview.

## Validasi dan konsistensi database

- Nama dinormalisasi NFC, di-trim, dan spasi berulang digabung. Panjang akhir
  1–150 karakter. Karakter kontrol/bidi serta awalan `=`, `+`, `-`, `@` ditolak.
- Kuota berupa integer 1–1000, sesuai batas check-in yang sudah tersedia.
- Body guest bersifat strict: kode, event ID, dan field check-in tidak dapat
  dimanipulasi melalui payload tambah/edit. PATCH memerlukan nama dan kuota.
- Kode tambah manual berasal dari 24 byte acak kriptografis (192 bit) dengan
  encoding base64url. Constraint `Invitation.code @unique` menjamin keunikan
  global; benturan pada pembuatan manual dicoba ulang maksimal tiga kali.
- Perubahan nama tidak mengganti kode. Edit kuota menggunakan conditional update
  pada database, sehingga kuota tidak dapat turun di bawah jumlah hadir bahkan
  bila check-in sedang berlangsung bersamaan. Field riwayat tidak ditulis ulang.
- Penghapusan memakai kondisi atomik: waktu dan petugas check-in harus null,
  serta jumlah hadir null/0. Undangan yang sudah check-in menghasilkan 409.
  Tidak ada penghapusan event atau cascade melalui fitur ini.
- Query daftar memakai transaksi Repeatable Read untuk count dan pagination
  konsisten. Detail mengambil petugas melalui select relasi tanpa loop query.
- Skema dan indeks `eventId`/kode unik yang ada sudah memadai untuk modul ini;
  tidak perlu menjalankan migrasi atau reset database.

## Impor CSV

```csv
guestName,guestQuota
Budi Santoso,2
Siti Aminah,1
"Andi, keluarga",4
```

Hanya CSV UTF-8 dengan pemisah koma yang didukung. Maksimal **256 KiB** dan
**500 baris data**. Header harus tepat `guestName` dan `guestQuota`, urutannya
boleh ditukar. UTF-8 BOM, LF/CRLF, quoted fields, escaped quotes, dan nama multiline
didukung; multiline dinormalisasi menjadi spasi. Baris kosong dilewati, sedangkan
baris `,` tetap dilaporkan invalid. Kutip rusak/header salah ditolak dengan pesan
file; kesalahan data dilaporkan berdasarkan nomor baris fisik awal record.

1. Pilih file, lalu **Lihat preview**. Browser memeriksa ekstensi, ukuran, dan
   decoding UTF-8. Server memeriksa ukuran byte CSV, struktur, header, dan setiap
   nilai. Batas byte body juga diterapkan pada request streaming sebelum JSON
   diparse, sehingga tidak hanya bergantung pada `Content-Length`.
2. Request preview: `{ mode: "preview", csv: "..." }`. Hasil memuat `rows`
   (nomor `line`, nama, kuota, `errors`, tanda `duplicate`, data ternormalisasi),
   `valid`, `invalid`, `duplicates`, dan `token`. Tidak ada data disimpan.
3. Nama sama dalam CSV atau yang sudah ada di event ditandai sebagai peringatan,
   tanpa menganggap nama sebagai identitas unik. Pengguna harus mencentang
   persetujuan untuk membuat setiap baris tersebut sebagai undangan terpisah.
4. **Semua baris harus valid** sebelum konfirmasi. Tidak ada impor parsial atau
   pengabaian baris secara diam-diam. Perbaiki file lalu buat preview baru.
5. Konfirmasi: `{ mode: "confirm", csv: "...", token: "...",
   allowDuplicateNames: false }`. Gunakan `true` hanya setelah persetujuan nama
   duplikat. Server memvalidasi ulang file dan nama yang sudah ada.
6. Token HMAC menggunakan `AUTH_SECRET`, berlaku 15 menit, dan terikat hash file,
   event, akun, serta nonce acak. Perubahan file/event/akun atau token kedaluwarsa
   mengharuskan preview baru. Data tamu tidak disimpan dalam token.
7. Penyimpanan memakai transaksi Serializable dan `createMany` tanpa
   `skipDuplicates`: berhasil seluruhnya atau rollback. Kode per baris diturunkan
   dengan HMAC dari token preview dan nomor baris, bersifat opaque dan unik.
   Konfirmasi ulang token yang sama berbenturan pada constraint kode, sehingga
   tidak membuat duplikat selama hasil impor tersebut masih ada.
8. Sukses mengembalikan 201 `{ imported: jumlah }`, menampilkan toast, dan memuat
   ulang daftar. Konflik transaksi menghasilkan 409; periksa daftar sebelum
   membuat preview ulang, terutama setelah koneksi terputus saat konfirmasi.

Preview baru atas file yang sama tetap dapat dipakai untuk impor disengaja;
nama yang sudah ada akan ditandai dan membutuhkan persetujuan. Tidak ada ledger
impor permanen pada sprint ini. Setelah seluruh undangan suatu impor dihapus,
constraint kode tidak lagi menjadi penanda bahwa preview pernah digunakan.

Nama dengan awalan formula ditolak; nilai preview yang mencurigakan diberi
awalan apostrof dan dirender sebagai teks React, bukan HTML/spreadsheet. Ekspor
CSV tidak termasuk sprint ini; bila ditambahkan, wajib menerapkan escaping
formula pada seluruh field teks dan quoting CSV yang sesuai.

## Integrasi check-in

Endpoint lama `POST /api/checkins` tetap menerima `{ eventId, code, count }`.
Kode hasil tambah manual dan impor langsung dapat digunakan oleh Super Admin
atau staff yang ditugaskan. Aturan acara/client aktif, kuota, pencegahan
check-in ganda, waktu, serta petugas tetap memakai implementasi sebelumnya.

Saat ini satu undangan hanya boleh check-in sekali. Kedatangan bertahap yang
direncanakan dalam PRD belum diimplementasikan pada sprint ini. QR scanner,
public pre-check-in, realtime, XLSX, booking, dan pembayaran di luar cakupan.

## Pengujian

```powershell
npx prisma validate
npm run typecheck
npm run lint
npm run test:auth
npm run test:management
npm run test:guests
npm run build
```

Jalankan server produksi untuk pengujian HTTP, menggunakan database development
yang sudah dikonfigurasi. Task **WedFlow: test server** juga tersedia.

```powershell
$env:AUTH_URL = 'http://localhost:3100'
npm run start -- --port 3100
```

Di terminal lain:

```powershell
npm run test:guests:e2e
npm run test:auth:e2e
```

Script membatasi target ke localhost/127.0.0.1. Fixture client, event, akun, dan
undangan memakai UUID unik dan dibersihkan dalam `finally`. Cleanup hanya
menyentuh fixture milik eksekusi uji. Jangan menghentikan paksa proses uji.

Unit test mencakup normalisasi, payload terlarang, filter, parser CSV, kuota,
header, UTF-8, batas ukuran/baris, duplikat, dan formula injection. Pengujian HTTP
mencakup seluruh 13 skenario yang diminta, constraint kode database, token
preview, rollback/replay, pagination, tampilan server, dan balapan edit/hapus
dengan check-in. Suite autentikasi lama memeriksa regresi role dan check-in.

### Hasil verifikasi implementasi

Pada 27 Oktober 2026:

- Prisma validation, TypeScript check, ESLint, dan production build lulus.
- 21 unit test lulus (10 guest, 6 auth, 5 management).
- 127 assertion HTTP Guest Management dan 141 assertion regresi auth/management
  lulus pada build produksi dengan PostgreSQL yang dikonfigurasi di project.
- Browser terintegrasi berhasil menjalankan tambah tamu, upload/preview CSV,
  persetujuan duplikat, konfirmasi impor, edit nama/kuota, detail, dan konfirmasi
  hapus. Kode tetap sama setelah edit. Tombol impor terkunci sebelum persetujuan.
- Pemeriksaan viewport 390, 768, dan 1440 px tidak menemukan overflow halaman;
  tabel memiliki scroll horizontal di mobile dan dialog impor muat dalam viewport.
- Seluruh fixture HTTP dan browser telah dibersihkan. Simulasi offline, pembaca
  layar, dan pengujian beban skala produksi belum dijalankan; gunakan checklist
  berikut untuk pengujian lanjutan.

### Checklist manual

| Skenario | Hasil yang diharapkan |
| --- | --- |
| Buka event tanpa tamu | Empty state, tombol tambah/impor, tautan kembali |
| Tambah nama kosong/kuota 0 | Ditolak; nilai valid tersimpan dan toast muncul |
| Edit nama/kuota | Kode tidak berubah; kuota di bawah hadir ditolak |
| Hapus sebelum/sesudah check-in | Konfirmasi sebelum hapus; setelah check-in diblokir |
| Cari nama/kode, filter, sort, pindah halaman | Hasil konsisten dan filter tetap di URL |
| Buka detail | Acara, kode, kuota, waktu WIB, jumlah hadir, petugas sesuai |
| CSV valid dan invalid | Preview tanpa simpan; nomor baris dan ringkasan benar |
| CSV nama duplikat | Peringatan dan persetujuan sebelum konfirmasi |
| Batal/ganti file | Belum ada data tersimpan; preview lama dibuang |
| Konfirmasi dua kali, ubah file/token/event | Tidak terjadi impor ulang dari token yang sama |
| Client/Staff/anon membuka URL/API admin | Redirect/401/403; kode tidak bocor |
| Guest ID event A dipakai di event B | 404; data asal tidak berubah |
| Gunakan kode hasil impor untuk check-in | Kuota dan penugasan diverifikasi, riwayat tercatat |
| Desktop/tablet/mobile dan keyboard | Form/dialog terbaca, tabel dapat digulir, fokus terkelola |
| Lambat/offline/error server | Pending/loading, error/retry, tidak ada toast sukses palsu |
