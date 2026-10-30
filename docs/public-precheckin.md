# Public QR Pre-check-in — Sprint 6

## Arsitektur

QR umum membuka `/e/[eventSlug]/checkin` tanpa login. Tamu mengirim satu nama
undangan, menerima tiket sementara, lalu menunjukkan kode antrean kepada petugas.
Halaman hanya mempublikasikan nama acara; tidak memuat guest list, kontak,
kode undangan, jumlah hadir, atau hasil pencocokan nama.

Pencocokan berjalan **ketika petugas membuka tiket**, menggunakan Smart Name
Search yang sudah ada. Ini sengaja menunda pencocokan dari request publik agar
nama terdaftar dan nama tidak terdaftar mengikuti jalur database dan respons
yang sama. Tidak ada kandidat yang dipilih otomatis, termasuk nama persis sama.

Pencatatan menggunakan `recordArrival` dan `CheckinLog` yang sudah ada.
Tidak ada tabel kehadiran atau counter kedua. Metode baru `PUBLIC_PRECHECKIN`
membedakan asal kedatangan pada riwayat.

## Konfigurasi dan QR umum

- `APP_ORIGIN` opsional; jika tidak ada, gunakan `AUTH_URL`.
- Nilai wajib berupa origin HTTPS tanpa path, query, hash, atau kredensial.
  HTTP hanya diterima untuk `localhost`, `127.0.0.1`, dan `[::1]`.
- Contoh lokal: `APP_ORIGIN=http://localhost:3000`.
- Contoh production: `APP_ORIGIN=https://wedflow.example.com`.
- Origin QR tidak pernah diambil dari header Host atau input tamu.
- Origin mutasi publik harus sama dengan konfigurasi tersebut. Jalankan halaman
  publik melalui origin kanonis, bukan alias host yang berbeda.
- Di detail event Super Admin, gunakan **Lihat / cetak QR umum** atau
  **Download QR umum PNG**. Hanya acara ACTIVE dengan client ACTIVE yang bisa
  menerbitkan poster. Poster memakai QR 1024px, margin putih, CSP nonce, dan
  tombol cetak baru aktif sesudah gambar selesai decode.
- QR mengandung URL acara, bukan token atau nama tamu. Mengganti slug atau
  domain membuat QR lama tidak berlaku; cetak ulang poster.

## Alur tamu

1. Pindai QR umum dan masukkan nama sesuai undangan (2–100 karakter).
2. Semua nama valid mendapat pesan generik yang sama dan tiket PENDING.
3. Simpan tangkapan layar kode antrean 8 karakter; datangi petugas.
4. Token cadangan tersedia dalam bagian yang dapat dibuka, hanya untuk
   ditunjukkan kepada petugas. Token tidak dimasukkan URL atau localStorage.
5. Tiket berlaku 20 menit. Status tampilan publik tidak mengungkap hasil
   verifikasi atau identitas undangan; tidak ada endpoint publik polling status.

Tiket bukan bukti undangan atau akses masuk. Tamu dengan nama yang tidak ada
tetap mendapatkan tiket, lalu ditangani petugas secara manual.

## Alur petugas

1. Login sebagai STAFF yang ditugaskan atau SUPER_ADMIN; buka detail event aktif.
2. Pilih **Antrean pre-check-in**. Daftar berisi 20 tiket per halaman,
   urutan terlama terlebih dahulu, filter status, muat berikutnya, dan muat ulang.
3. Pilih tiket dari daftar atau masukkan kode antrean/token cadangan.
4. Periksa nama yang dikirim dan kandidat dari event yang sama. Bila perlu,
   lakukan pencarian internal lain; cocokkan nama, kuota, referensi undangan,
   dan informasi dari tamu/koordinator. Nama saja bukan bukti identitas.
5. Pilih kandidat untuk membuka dialog verifikasi. Periksa nama acara,
   undangan, jumlah hadir, sisa kuota, dan jumlah yang datang.
6. Centang konfirmasi manual, lalu **Konfirmasi check-in**.
7. Untuk permintaan yang tidak sesuai, pilih **Tolak / batalkan tiket** dan
   konfirmasi pembatalan. Pembatalan tidak mencatat kehadiran.

Antrean menggunakan refresh manual; tidak ada WebSocket atau sinkronisasi offline.
Jika response pencatatan hilang setelah commit, dialog mempertahankan payload
dan menampilkan **Coba ulang transaksi**. Retry sukses tidak menambah kehadiran.

## Endpoint aktual

Semua respons JSON menggunakan `Cache-Control: private, no-store`.

| Metode | Endpoint | Akses / input |
|---|---|---|
| GET | `/e/:eventSlug/checkin` | Publik; hanya nama acara aktif dan form |
| POST | `/api/public/events/:eventSlug/precheckin` | Publik, `{name}`; 201 berisi message, token, queueCode, expiresAt, status PENDING |
| GET | `/api/admin/events/:eventId/public-qr` | SUPER_ADMIN; poster HTML siap cetak |
| GET | `/api/admin/events/:eventId/public-qr?download=1` | SUPER_ADMIN; PNG attachment |
| GET | `/api/precheckins?eventId=...&status=PENDING&cursor=...` | STAFF/SUPER_ADMIN; antrean ter-scoped; status juga VERIFIED/CANCELLED/EXPIRED |
| POST | `/api/precheckins/open` | STAFF/SUPER_ADMIN; `{eventId,lookup}`; lookup kode antrean atau token, hasil tiket dan kandidat |
| POST | `/api/precheckins/verify` | STAFF/SUPER_ADMIN; `{eventId,requestId,invitationId}`; snapshot/token verifikasi, tanpa mencatat hadir |
| POST | `/api/precheckins/cancel` | STAFF/SUPER_ADMIN; `{eventId,requestId}` |
| POST | `/api/checkins` | Endpoint lama; `{eventId,verificationToken,confirmed:true,count}` |

Tidak ada GET publik untuk mencari nama, membaca tiket, atau daftar tamu.
Token sementara dikirim pada body POST ketika petugas memakai fallback token;
tidak masuk query string, referrer, atau link. Error tidak mengembalikan input
nama, hash token, SQL, atau identitas kandidat publik.

## Database dan migrasi

[Migrasi](../prisma/migrations/20261030000000_public_precheckin/migration.sql)
bersifat aditif dan transactional. Tidak mengubah counter atau riwayat lama.
Tidak memerlukan backfill atau reset.

[Migrasi timezone](../prisma/migrations/20261031000000_precheckin_timezone/migration.sql)
memakai TIMESTAMPTZ(3) untuk waktu tiket dan rate limiter. Ini mencegah expiry
prematur ketika zona waktu PostgreSQL bukan UTC. Timestamp tiket lama dibaca
sebagai UTC, sedangkan bucket limiter lama dikonversi dari zona sesi database
yang menulis CURRENT_TIMESTAMP. Waktu kedatangan pertama yang baru ditulis ke
kolom Invitation lama secara eksplisit dikonversi ke UTC; data historis tidak diubah.
Pool Prisma menetapkan startup option PostgreSQL `timezone=UTC` pada setiap
koneksi, karena wire DateTime adapter harus diinterpretasi sebagai UTC, termasuk
untuk TIMESTAMPTZ. Ini tidak mengubah timezone global database atau record lama.

`PrecheckinRequest` menyimpan:

- UUID, eventId, submittedName, SHA-256 tokenHash unik, queueCode unik per event.
- status PENDING/VERIFIED/EXPIRED/CANCELLED, createdAt, expiresAt.
- verifiedAt atau cancelledAt dan processedById untuk jejak petugas.
- invitationId dan checkinLogId hanya terisi setelah sukses; logId unik.
- FK ke event, undangan, dan log memakai Restrict; penghapusan user memakai
  SetNull agar jejak transaksi tetap ada.
- Index antrean `(eventId,status,createdAt,id)`, expiry `(status,expiresAt)`,
  invitationId, processedById; constraint format hash/kode, masa berlaku, dan
  konsistensi field per status.

`PrecheckinRateLimit` menyimpan key, count, expiresAt; index expiry dan constraint
count positif. Tidak menyimpan IP mentah. `CheckinMethod` mendapat nilai
`PUBLIC_PRECHECKIN`. Jalankan CLI lokal project:

```sh
npx prisma migrate deploy
npx prisma generate
```

## Lifecycle, concurrency, dan replay

```text
PENDING ── konfirmasi petugas + commit kehadiran ──> VERIFIED
PENDING ── pembatalan petugas ────────────────────> CANCELLED
PENDING ── waktu habis ───────────────────────────> EXPIRED
```

Tidak ada transisi kembali ke PENDING. Expiry efektif berdasarkan timestamp,
meskipun enum belum dimaterialisasi. Enum EXPIRED disimpan saat antrean/tiket
dibaca atau diverifikasi; request kedaluwarsa yang belum pernah dibuka dapat
tetap tersimpan sebagai PENDING sampai akses berikutnya.

Urutan lock transaksi kehadiran: event/client → user/penugasan → tiket → undangan.
Status/assignment dicek ulang dalam transaksi. Ticket row lock menghalangi
dua petugas memproses tiket sama, bahkan bila memilih undangan berbeda.
Counter undangan dan `CheckinLog` memakai operasi atomik lama. Update status
VERIFIED bersyarat PENDING dan `expiresAt > clock_timestamp()` dilakukan dalam
transaksi yang sama. Kegagalan kuota, expiry, atau konflik me-rollback semuanya.

Signed verification mengikat tiket, petugas, event, undangan, snapshot kuota,
nama, dan jumlah hadir. Public token saja tidak dapat mencatat kehadiran.
Nonce verifikasi menjadi ID log/replay key. Retry payload identik yang sudah
commit boleh mengembalikan hasil lama; ini tidak memakai tiket untuk kedatangan
baru. Tiket baru diperlukan untuk kedatangan keluarga berikutnya lewat jalur ini.
Jalur QR pribadi/nama tetap mendukung kedatangan berikutnya dengan kuota yang sama.

## Rate limiting dan privasi

Pembatasan publik memakai PostgreSQL conditional UPSERT dan waktu database,
sehingga beberapa instance berbagi budget yang sama:

- Default tanpa header IP tepercaya: 120 request/10 menit secara global.
- Dengan `PRECHECKIN_IP_HEADER`: 10 request/10 menit per IP, lintas event.
- Tambahan 600 tiket/10 menit per event aktif.
- Jendela tetap dihitung sejak request pertama; tidak diperpanjang setiap hit.
- Penghapusan bucket kedaluwarsa lebih dari sehari dibatasi 500 per request.
- DB/ingress tidak tersedia: gagal tertutup; tidak berpindah ke limiter memori.

**Konfigurasi ingress wajib benar sebelum mengaktifkan PRECHECKIN_IP_HEADER.**
Header harus berisi satu IP valid dan selalu ditimpa proxy tepercaya; cegah
akses langsung ke origin. Jangan mempercayai header yang bisa dikirim bebas
oleh client. Header hilang/tidak valid saat dikonfigurasi menghasilkan 503.
Mode default aman tanpa kepercayaan header, tetapi budget bersama dapat
membatasi banyak tamu sekaligus. IP bersama/NAT juga berbagi budget; sesuaikan
limit setelah pilot. Nama tidak mempengaruhi budget atau bentuk response.

Origin check, JSON-only, batas body aktual 2048 byte, Zod, normalisasi NFC,
penolakan control characters, serta panjang input membatasi penyalahgunaan.
Token 256-bit acak hanya ditampilkan sekali; hash disimpan di DB. Kode antrean
32-bit bukan kredensial, dan hanya dapat dicari petugas terautentikasi.

## Pengujian

```sh
npm run typecheck
npm run lint
npm run build
npm run test:precheckins
npm run test:precheckins:migration
npm run test:checkins
```

Untuk pengujian HTTP/browser, jalankan hasil build dengan AUTH_URL dan
APP_ORIGIN (bila disetel) yang sama dengan URL server uji, misalnya
`http://localhost:3100`, lalu:

```sh
npm run test:precheckins:e2e
npm run test:checkins:e2e
```

Script menggunakan Postgres terkonfigurasi, membuat fixture UUID terisolasi,
dan membersihkannya di finally. Tidak mereset data user. Browser integration
memakai Microsoft Edge melalui Playwright; diperlukan Edge terpasang.
Request uji juga memakai budget limiter publik normal; tunggu jendela berakhir
jika beberapa suite dijalankan berulang sangat cepat.

Pengujian mencakup nama dikenal/tidak dikenal, duplikat, isolasi event/role,
origin/input invalid, hash token, expiry setelah verifikasi, kuota bertahap,
double submit, race antarpetugas dengan kandidat berbeda, race pembatalan,
poster QR yang benar-benar didecode, limiter concurrent/expiry/HTTP, mobile
320/390px, checkbox manual, serta retry setelah response commit hilang.

Uji HP fisik: deploy melalui HTTPS dengan origin kanonis, cetak poster,
pindai memakai aplikasi kamera HP, kirim nama, lalu verifikasi dengan akun
Staff di perangkat kedua. Uji Android/iPhone, jaringan lambat, nama serupa,
tiket habis masa berlaku, dan dua petugas. Emulasi viewport tidak menggantikan
pengujian perangkat fisik atau pilot beban acara.

## Batasan

- Tidak ada bukti identitas otomatis, CAPTCHA, WebSocket, offline sync, atau
  pengiriman WhatsApp. Petugas tetap bertanggung jawab memeriksa undangan.
- Receipt disimpan dalam memori halaman; reload menutup receipt. Simpan kode
  antrean atau gunakan pencarian nama petugas jika hilang.
- Retry pengiriman publik ketika response hilang dapat membuat tiket tambahan;
  tidak mencatat kehadiran. Pembatasan publik dan verifikasi manual tetap berlaku.
- Expiry bukan penghapusan data. Retensi submittedName, hash token, dan audit
  memerlukan kebijakan operasional dan pembersihan terjadwal terpisah.
- Anggaran anti-abuse perlu tuning pada pilot; serangan terdistribusi masih
  memerlukan pembatasan ingress/WAF dan pemantauan operasional.
- Belum diuji pada HP fisik dan belum dilakukan uji beban skala acara produksi.

## File utama

- [Schema](../prisma/schema.prisma), [migrasi](../prisma/migrations/20261030000000_public_precheckin/migration.sql).
- [Modul pre-check-in](../src/features/precheckins/) dan [halaman publik](../src/app/e/[eventSlug]/checkin/page.tsx).
- [API publik](../src/app/api/public/events/[eventSlug]/precheckin/route.ts), [API petugas](../src/app/api/precheckins/).
- [QR admin](../src/app/api/admin/events/[eventId]/public-qr/route.ts).
- [Transaksi kehadiran](../src/features/checkins/service.ts), [dialog bersama](../src/features/checkins/checkin-form.tsx).
- [Unit tests](../tests/precheckins.test.ts), [integrasi](../scripts/test-precheckins-e2e.ts), [browser](../scripts/test-precheckins-browser.ts).

## Hasil verifikasi lokal (31 Oktober 2026)

- TypeScript, ESLint, production build, dan `git diff --check`: lulus.
- Seluruh unit tests: 42 lulus.
- Public pre-check-in HTTP/PostgreSQL: 139 assertion lulus.
- Browser Edge headless: viewport 320/390px, form tamu tanpa login, token tidak
  masuk URL, lookup tiket, konfirmasi manual, retry setelah response commit
  hilang, dan poster siap cetak lulus; tidak ada runtime error.
- Regresi Smart Check-in: 105 assertion lulus.
- Regresi auth/manajemen: 141 assertion lulus; guest management: 138 lulus.
- Regresi QR HTTP: otorisasi, isolasi, PNG decode, print, CSV, uniqueness,
  concurrency dan replay lulus.
- Migrasi diuji di schema sementara yang di-rollback: counter/log lama tetap,
  constraint lifecycle/FK berfungsi, konversi timestamp mempertahankan instant.

Restart development server setelah perubahan pool Prisma agar koneksi lama
yang tersimpan melalui hot reload diganti dengan koneksi UTC.

## Inventaris perubahan

File baru:

- [Dokumentasi fitur](./public-precheckin.md).
- [Migrasi model](../prisma/migrations/20261030000000_public_precheckin/migration.sql),
  [migrasi timezone](../prisma/migrations/20261031000000_precheckin_timezone/migration.sql).
- [Halaman tamu](../src/app/e/[eventSlug]/checkin/page.tsx),
  [error boundary](../src/app/e/[eventSlug]/checkin/error.tsx).
- [API submit publik](../src/app/api/public/events/[eventSlug]/precheckin/route.ts),
  [API QR admin](../src/app/api/admin/events/[eventId]/public-qr/route.ts).
- API antrean: [list](../src/app/api/precheckins/route.ts),
  [open](../src/app/api/precheckins/open/route.ts),
  [verify](../src/app/api/precheckins/verify/route.ts),
  [cancel](../src/app/api/precheckins/cancel/route.ts).
- Modul: [service](../src/features/precheckins/service.ts),
  [validation](../src/features/precheckins/validation.ts),
  [ticket](../src/features/precheckins/ticket.ts),
  [rate-limit](../src/features/precheckins/rate-limit.ts),
  [QR/print](../src/features/precheckins/qr.ts),
  [form publik](../src/features/precheckins/public-form.tsx),
  [antrean petugas](../src/features/precheckins/queue.tsx).
- [Unit test](../tests/precheckins.test.ts),
  [integrasi HTTP](../scripts/test-precheckins-e2e.ts),
  [browser](../scripts/test-precheckins-browser.ts),
  [migrasi](../scripts/test-precheckin-migration.ts).

File diubah:

- [Schema](../prisma/schema.prisma), [koneksi Prisma UTC](../src/lib/prisma.ts).
- Check-in: [service](../src/features/checkins/service.ts),
  [signed verification](../src/features/checkins/verification.ts),
  [tipe validasi](../src/features/checkins/validation.ts),
  [form dan dialog](../src/features/checkins/checkin-form.tsx).
- [Detail event](../src/components/dashboard/event-detail.tsx).
- [Script package](../package.json), [README](../README.md), [PRD](../PRD.md).
