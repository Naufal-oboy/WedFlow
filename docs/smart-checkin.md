# Smart Check-in — Sprint 5

Implementasi pada branch `feature/smart-checkin` memakai Next.js App Router,
Auth.js, Prisma 7/PostgreSQL, shadcn/ui Base UI, Zod, dan `jsQR` untuk decoder
kamera. `html5-qrcode` 2.3.8 sudah terpasang dan telah dievaluasi: lifecycle
kameranya dapat selesai sebelum video siap, sedangkan `scanFile` membuat URL
blob yang tidak dilepas pada setiap frame. Karena scanner berjalan terus selama
acara, `jsQR` yang sudah dipakai pengujian QR dipindahkan ke dependency runtime
dan dimuat dinamis. Tidak ada model Guest atau Invitation baru.

## Arsitektur dan hasil audit

- `Invitation` sudah memuat kode unik, kuota, jumlah hadir, waktu, dan petugas.
  Endpoint lama hanya menerima satu kedatangan karena memeriksa `checkedInAt`.
- `EventStaff` dan `eventScope` menjadi sumber otorisasi penugasan; JWT Auth.js
  membaca ulang akun dan membatalkan sesi ketika akun berubah.
- Belum ada struktur riwayat. `CheckinLog` ditambahkan sebagai catatan setiap
  kedatangan sekaligus ledger idempotency. Tidak ditambahkan AuditLog duplikat.
- Dashboard event bersama menampilkan modul ini pada `/staff/events/:eventId`
  dan `/admin/events/:eventId` untuk acara/client aktif. Client tetap melihat
  laporan sesuai kepemilikan, tanpa pencarian operasional atau token verifikasi.
- Pembuatan QR, impor, nama duplikat, edit kuota atomik, dan larangan penghapusan
  setelah hadir dipertahankan. Statistik tetap menjumlahkan
  `Invitation.checkedInCount`, bukan menambahkan total log ke total undangan.

| Bagian | Implementasi |
| --- | --- |
| UI dan dialog konfirmasi | [checkin-form.tsx](../src/features/checkins/checkin-form.tsx) |
| Kamera dan lifecycle | [qr-scanner.tsx](../src/features/checkins/qr-scanner.tsx), [scanner-session.ts](../src/features/checkins/scanner-session.ts) |
| Query dan transaksi | [service.ts](../src/features/checkins/service.ts) |
| Validasi dan token | [validation.ts](../src/features/checkins/validation.ts), [verification.ts](../src/features/checkins/verification.ts) |
| Pembatasan request | [rate-limit.ts](../src/features/checkins/rate-limit.ts) |
| API | [checkins/](../src/app/api/checkins/) |
| Skema dan migrasi | [schema.prisma](../prisma/schema.prisma), [migration.sql](../prisma/migrations/20261029000000_smart_checkin/migration.sql) |

## Scan QR dan kode manual

1. Pilih event yang ditugaskan, buka **Scan QR**, lalu **Aktifkan kamera**.
   Browser meminta izin; kamera belakang diprioritaskan. Jika terdapat beberapa
   kamera, petugas dapat memilihnya setelah izin diberikan.
2. Library dimuat hanya di browser, membaca format QR saja. Stream dimiliki
   komponen melalui `getUserMedia`; frame dibatasi sisi maksimum 640 px dan
   didekode berurutan dengan `jsQR`, dengan jeda 250 ms.
   Frame hanya berada di memori browser, tidak diunggah atau disimpan.
   Tidak ada File/object URL per frame. Kepemilikan stream eksplisit menangani
   pembatalan saat permission prompt/video play masih pending. Satu sesi scanner
   hanya memproses satu hasil. Kamera berhenti saat hasil diterima, scanner
   ditutup, tab metode diganti, halaman disembunyikan/ditinggalkan, atau unmount.
   Cleanup juga menangani izin/start yang belum selesai.
3. Payload QR dikirim sebagai kode saja ke server. Format mengikuti generator
   yang ada: `WF-` + 64 digit hex, atau token base64url Guest Management.
   URL/JSON bukan payload undangan. Server memeriksa kode pada event terpilih.
4. Kode manual menjadi fallback tanpa kamera. Kode lama berkarakter huruf,
   angka, underscore, dan tanda minus (maksimal 200) tetap diterima. Kode legacy
   lain dapat dicari melalui nama tanpa mengganti kode yang sudah dibagikan.
5. Server mengembalikan detail dan token verifikasi, tanpa mencatat kehadiran.
   Dialog memuat nama, event, referensi ID undangan, kuota, sudah hadir, sisa,
   dan jumlah yang datang sekarang. Petugas wajib mencentang konfirmasi manual.
6. Tekan **Konfirmasi check-in**. Setelah sukses, sisa kuota, riwayat, dan
   statistik halaman diperbarui. Kedatangan berikutnya memerlukan verifikasi baru.

## Smart Name Search

- Debounce 300 ms; query 2–100 karakter, case-insensitive, partial match,
  toleransi typo melalui PostgreSQL `pg_trgm`. Indeks GIN pada nama huruf kecil
  membantu pencarian. Kandidat selalu dibatasi event di SQL, maksimum 20 hasil.
- Urutan: nama sama persis, cocok sebagian, lalu skor similarity/word similarity,
  nama dan ID untuk urutan stabil. Query `%`, `_`, dan backslash diperlakukan
  sebagai teks literal pada partial match, bukan wildcard dari petugas.
- Hasil memuat nama, kuota, jumlah hadir, status, dan ID undangan. Tidak ada kode
  QR, kontak tamu, atau email petugas. Nama sama memiliki baris/ID berbeda.
- Request pencarian lama dibatalkan ketika input berubah. Tersedia loading,
  empty state, dan error. Klik kandidat membuka verifikasi server dan dialog;
  tidak ada pemilihan otomatis atau pencatatan dari hasil pencarian.
- Nama bukan bukti identitas. Cocokkan nama/kuota/referensi dengan tamu atau
  koordinator. Bila masih ambigu, minta koordinator memeriksa daftar undangan;
  sistem tidak menebak identitas atau menampilkan data pribadi tambahan.

## Check-in bertahap, concurrency, dan replay

`checkedInCount` merupakan total kumulatif (null lama diperlakukan sebagai 0).
`checkedInAt` dan `checkedInById` tetap waktu/petugas kedatangan pertama.
Kuota 4 dapat dicatat sebagai 2 + 1 + 1; jumlah 0, negatif, pecahan, atau melebihi
sisa ditolak server.

Token HMAC dengan `AUTH_SECRET` berlaku 10 menit, terikat akun, event, undangan,
metode, nama, kuota, jumlah hadir saat verifikasi, serta nonce acak UUID.
Token ini bukan QR undangan. Nonce menjadi primary key log dan idempotency key
per kedatangan: token yang sama dengan count sama mengembalikan log sebelumnya
(HTTP 200), termasuk setelah expiry; payload berbeda menghasilkan 409.
Token kedaluwarsa yang belum pernah berhasil tidak dapat mencatat kedatangan.

Transaksi PostgreSQL Read Committed mengunci event/client/user/assignment untuk
mencegah perubahan akses melampaui transaksi, kemudian mengunci baris undangan
`FOR UPDATE`. Server memeriksa ulang scope dan status. Update atomik memakai
`COALESCE(count, 0) + jumlah <= guestQuota`. Update dan log commit bersama.
Constraint database juga memastikan jumlah tidak negatif/melebihi kuota dan
waktu hadir konsisten. Dua token hasil verifikasi kondisi lama tidak bisa
bersamaan menambah kehadiran: setelah transaksi pertama, token kedua menjadi
stale dan petugas harus melihat sisa kuota terbaru. Lock undangan juga bekerja
bersama conditional update kuota dan penghapusan pada Guest Management.

Double-click dicegah dengan lock UI dan tombol pending. Bila respons hilang,
dialog mempertahankan token dan jumlah untuk **Coba ulang transaksi**; jangan
membuat verifikasi baru sebelum hasil transaksi diketahui. State retry saat ini
berlaku pada tab aktif. Jika tab direload/ditutup ketika hasil belum diketahui,
periksa riwayat dengan koordinator sebelum mengonfirmasi kedatangan baru.

## Perubahan database dan deployment

`CheckinLog`: ID, invitationId, eventId, userId nullable (akun lama dapat sudah
dihapus), count positif, enum metode QR/NAME_SEARCH/MANUAL, createdAt, dan legacy.
FK undangan/event memakai Restrict agar riwayat tidak terhapus lewat cascade;
penghapusan akun menggunakan SetNull. Indeks tersedia untuk riwayat event,
undangan, dan petugas.

Migrasi transaksional menambahkan `pg_trgm`, indeks nama, enum, log, serta
constraint kehadiran. Setiap undangan lama yang telah hadir memperoleh satu log
`legacy:<invitationId>` dengan jumlah/waktu/petugas asli dan metode MANUAL
(endpoint terdahulu berbasis kode manual). `legacy=true` menandai sumber migrasi.
Migrasi tidak menambah/mengubah total undangan. Data lama tidak konsisten
(misalnya timestamp terisi tetapi jumlah tidak diketahui) membuat migrasi gagal
secara atomik; periksa dan rekonsiliasi data sebelum mencoba kembali, jangan
mengarang jumlah/waktu. Prisma hanya menjalankan migrasi ini satu kali.

Untuk deployment, cadangkan database dan hentikan penulisan dari aplikasi versi
lama selama migrasi dan pergantian versi agar log dan total tidak menyimpang.
Pastikan akun migrasi memiliki izin membuat extension `pg_trgm` (atau DBA
memasangnya lebih dahulu). Pada database besar jadwalkan maintenance: pembuatan
indeks dan validasi constraint pada migrasi ini menggunakan lock database.

```powershell
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npm run build
```

Tidak menggunakan reset atau db push. Laporan memilih total kumulatif undangan
atau penjumlahan log (termasuk legacy), bukan keduanya sekaligus.

## API

Semua operasi baru hanya SUPER_ADMIN/STAFF, memakai session, pemeriksaan event,
Zod, error `{ error, fields? }`, dan `Cache-Control: private, no-store`.
POST memerlukan Origin yang sama dengan `AUTH_URL` dan JSON maksimal 8 KiB.

| Metode/path | Input | Respons |
| --- | --- | --- |
| GET `/api/checkins/search` | `eventId`, `q` | `{ invitations }`, maksimal 20 |
| POST `/api/checkins/verify` | `{eventId, method:"QR"\|"MANUAL", code}` atau `{eventId, method:"NAME_SEARCH", invitationId}` | `{event, invitation, verificationToken}` |
| GET `/api/checkins/detail` | `eventId`, `invitationId` | `{invitation}`, tanpa token/kode |
| POST `/api/checkins` | `{eventId, verificationToken, confirmed:true, count}` | 201 kedatangan baru / 200 replay; `{success,replayed,invitation,arrival}` |
| GET `/api/checkins/history` | `eventId`, opsional `invitationId`, `cursor` | `{arrivals,nextCursor}`, 20 per halaman |
| GET `/api/checkins` | `eventId` | API laporan lama dipertahankan; termasuk CLIENT sesuai kepemilikan |

**Perubahan kontrak POST:** `{eventId,code,count}` lama sekarang ditolak 400.
Semua pemanggil wajib melakukan verify lalu confirm; tidak disediakan bypass
kompatibilitas yang melewati konfirmasi. Kode undangan tersimpan tetap sama.
Status lain: 400 input/QR invalid, 401 belum login, 403 role/origin, 404 event atau
undangan di luar scope/tidak ditemukan, 409 kuota/stale/expiry/replay berbeda,
413 body besar, 415 content type, 429 rate limit.

Budget operasi check-in baru 120 request/menit per akun, mencakup pencarian,
verifikasi, detail, riwayat, dan penulisan. Limiter mengikuti pola project:
in-memory, maksimal 10.000 akun aktif, cleanup entry kedaluwarsa. Deployment
multi-instance membutuhkan limiter bersama di gateway/Redis sebelum pilot;
budget per proses tidak menjamin batas global. API laporan lama tidak menjadi
endpoint pencarian nama dan tidak menerima query pencarian.

## Pengujian

```powershell
node --conditions=react-server --import tsx --test tests/*.test.ts
npm run test:checkins:migration
npm run typecheck
npm run lint
npm run build
```

Task **WedFlow: test server** menjalankan build produksi pada localhost:3100.
Dengan server aktif:

```powershell
npm run test:auth:e2e
npm run test:guests:e2e
$env:CHECKIN_BROWSER_TESTS='1'
npm run test:checkins:e2e
```

HTTP memakai login Auth.js nyata dan PostgreSQL, fixture UUID unik, cleanup hanya
data yang dibuat suite. Uji migrasi membuat schema sementara dalam transaksi
yang selalu di-rollback. Browser menggunakan Edge headless bawaan (`msedge`,
dapat diganti lewat `QR_BROWSER_CHANNEL`), viewport 390 px, canvas MediaStream
dan decoder QR nyata; tidak mengklaim kamera fisik sudah diuji.

Cakupan: role/assignment/revocation, nama typo/partial/duplikat, QR valid dan
lintas event/invalid, konfirmasi wajib, kedatangan 2+1+1, kuota, concurrent
requests, replay/tampering/expiry, setiap log, perubahan nama/kuota/status,
rate limit, backfill, cleanup kamera, fallback manual, dan retry respons hilang.

## Testing HP dan limitasi

Hasil verifikasi lokal, 29 Oktober 2026:

- 38 unit test lulus; 8 test check-in dijalankan ulang setelah penyelesaian scanner.
- 105 assertion HTTP smart check-in lulus dengan PostgreSQL dan Auth.js nyata.
- Regresi auth/management 141 assertion dan Guest Management 138 assertion lulus,
  termasuk suite integrasi QR.
- Uji migrasi/backfill dan penolakan data lama tidak konsisten lulus.
- Browser Edge headless pada build akhir lulus: viewport mobile, izin kamera
  ditolak, fallback manual, konfirmasi wajib, kehilangan respons lalu retry,
  pemilihan kamera, close/tab/pagehide, pembatalan saat izin pending, decoding QR
  dari MediaStream, pencarian typo, dan pemeriksaan error/overflow.
- Prisma validation, TypeScript, ESLint, production build, dan `git diff --check`
  lulus. Migrasi telah diterapkan ke PostgreSQL lokal. Semua fixture dibersihkan.

Checklist pilot perangkat fisik:

1. Gunakan staging HTTPS dengan sertifikat dipercaya HP dan `AUTH_URL` sesuai
   origin; akses `http://IP-LAN:3100` umumnya tidak mendapat izin kamera.
2. Login akun STAFF yang ditugaskan pada event aktif. Uji Chrome Android dan
   Safari iPhone, izin allow/deny, kamera belakang/depan, tutup scanner, pindah
   aplikasi, kembali, dan navigasi halaman. Pastikan indikator kamera padam.
3. Pindai QR tercetak dan QR dari layar; coba cahaya redup, rotasi, QR rusak,
   kode dari event lain, dan fallback manual. Pastikan belum hadir sebelum klik
   konfirmasi dan centang verifikasi.
4. Dengan dua HP, verifikasi undangan kuota 1 lalu konfirmasi bersamaan.
   Hanya satu kedatangan tercatat; yang lain diminta verifikasi ulang.
5. Simulasikan koneksi terputus setelah menekan konfirmasi. Retry token yang
   sama harus mengembalikan kedatangan sebelumnya. Periksa riwayat dan kuota.

Fuzzy matching memberi kandidat, bukan identifikasi. Dua nama/kuota sama tetap
memerlukan bantuan koordinator bila referensi tidak diketahui. Belum ada uji
beban skala produksi atau uji kamera fisik Android/iPhone. Riwayat dan statistik
diperbarui setelah sukses atau tombol muat ulang; tidak memakai WebSocket atau
polling lintas perangkat. Tidak ada public pre-check-in, pembayaran, booking,
atau sinkronisasi offline. Riwayat menampilkan nama tamu/petugas saat ini; ID,
jumlah, waktu, dan metode kedatangan merupakan catatan permanennya.
