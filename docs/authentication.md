# Authentication & RBAC — WedFlow

Implementasi menggunakan Next.js 16.4.3, Auth.js 5.0.0-beta.32 Credentials,
Prisma 7.10.1, PostgreSQL, bcryptjs, dan Zod. Tidak ada registrasi publik.

## Setup lokal

1. `npm install`
2. Isi `.env` berdasarkan [contoh environment](../.env.example). Pertahankan
   `DATABASE_URL` PostgreSQL yang sudah ada. Jangan commit file `.env`.
3. `npm run auth:secret` membuat secret acak 32 byte di `.env` tanpa mencetak
   nilainya. Secret yang sudah tersedia tidak diganti. Runtime menolak secret
   kosong atau kurang dari 32 karakter. Pada deployment, simpan secret yang sama
   untuk semua instance di secret manager hosting.
4. `npx prisma migrate deploy` lalu `npm run db:generate`.
5. Isi `SUPER_ADMIN_EMAIL`, `SUPER_ADMIN_PASSWORD`, dan opsional
   `SUPER_ADMIN_NAME` di `.env` lokal. Password minimal 12 karakter, maksimal
   72 byte UTF-8 (batas bcrypt). Password tidak di-trim atau dipotong.
6. `npm run db:seed`.
7. `npm run dev` dan buka `http://localhost:3000/login`.

`AUTH_URL` harus sama dengan origin aplikasi, misalnya `http://localhost:3000`
untuk lokal dan domain HTTPS untuk deployment. Jangan mengaktifkan
`AUTH_TRUST_HOST` pada proxy yang tidak mengontrol header host.
CLI seed memuat `.env`; Next.js juga memuat `.env.local` yang dapat menimpa nilai
di `.env`. Hindari pengaturan database berbeda di kedua file tersebut.

## Bootstrap Super Admin

[Seed](../prisma/seed.ts) memakai [bootstrap bersama](../src/features/auth/bootstrap.ts),
hash bcrypt cost 12, dan transaksi dengan PostgreSQL advisory lock.
Pemanggilan berulang tidak membuat akun duplikat, mengganti password, atau
menaikkan role akun yang kebetulan menggunakan email sama. Jika Super Admin
sudah ada, seed tidak membuat Super Admin kedua. Konflik email dengan akun
non-admin ditolak. Setelah akun dibuat, variabel password bootstrap boleh
dihapus dari environment aplikasi produksi.

## Struktur implementasi

- [Auth.js](../src/auth.ts): Credentials, JWT delapan jam, session callbacks,
  validasi secret, redirect allowlist, dan log error tanpa payload sensitif.
- [Auth feature](../src/features/auth/): validasi, password hashing, bootstrap,
  server actions, guard halaman/API, form login, pengelolaan akun.
- [Event feature](../src/features/events/): filter kepemilikan dan penugasan,
  query server, serta form penugasan.
- [Dashboard components](../src/components/dashboard/): ringkasan dan detail acara.
- [Layout components](../src/components/layout/): brand, sidebar, header,
  navigasi, tombol logout.
- [Login](../src/app/(auth)/login/page.tsx): emerald, ivory, champagne gold,
  responsif, show/hide password, validasi, pesan error generik, loading state.

Credentials + JWT tidak membutuhkan PrismaAdapter Auth.js atau tabel OAuth
Account/Session/VerificationToken. Paket `@auth/prisma-adapter` yang sebelumnya
terpasang dipertahankan tetapi tidak digunakan. Koneksi database tetap memakai
[singleton PrismaPg yang ada](../src/lib/prisma.ts).

## Relasi dan migrasi

[Migrasi tambahan](../prisma/migrations/20261024010000_auth_access/migration.sql)
hanya menambah:

- `User.clientId` nullable: menghubungkan akun CLIENT dengan satu Client.
  Satu Client dapat memiliki beberapa akun dan beberapa event.
- `EventStaff`: relasi banyak-ke-banyak antara staff dan event, dengan kunci
  gabungan yang mencegah penugasan ganda.
- `Invitation.checkedInAt`, `checkedInById`, `checkedInCount`: pencatatan
  kehadiran. Sejak Sprint 5, jumlah hadir kumulatif dan metadata kedatangan
  pertama dipertahankan; transaksi dan CheckinLog mencegah replay serta kuota
  terlampaui. Lihat [Smart Check-in](./smart-checkin.md).

Model User dan enum Role yang sudah ada digunakan kembali. Tidak ada reset,
penghapusan tabel, atau perubahan data lama. Akun CLIENT lama tanpa `clientId`
dan STAFF tanpa penugasan melihat daftar acara kosong sampai dihubungkan admin.

## Matriks akses

| Role | Halaman | Data acara | Menulis check-in |
| --- | --- | --- | --- |
| SUPER_ADMIN | `/admin`, `/admin/users`, `/admin/events/:id` | Semua client | Ya |
| CLIENT | `/client`, `/client/events/:id` | Hanya Client yang terhubung | Tidak |
| STAFF | `/staff`, `/staff/events/:id` | Hanya penugasan EventStaff | Ya |

Pengguna belum login diarahkan ke `/login`. Akses lintas role diarahkan ke
dashboard role pengguna. Layout, halaman yang membaca data, dan API memiliki
pemeriksaan server. Query memasukkan scope pengguna di kondisi database,
termasuk saat ID event dikirim langsung. Respons API tanpa sesi adalah 401,
role salah 403, dan resource di luar scope 404.

JWT menyimpan ID dan atribut aman, tanpa passwordHash. Setiap pembacaan session
memeriksa akun database. Perubahan `User.updatedAt` (password, role, nama,
clientId) membatalkan JWT lama. Penugasan staff selalu dibaca saat query,
sehingga pencabutan akses berlaku pada request selanjutnya. Data private tidak
disimpan dalam shared Next.js cache. Suspense digunakan karena Cache Components
sudah aktif pada proyek ini.

Form login/logout memakai server actions dengan pemeriksaan origin Next.js.
Endpoint Auth.js memakai mekanisme CSRF bawaan. API mutasi mensyaratkan header
`Origin` yang sama dengan `AUTH_URL`/origin request. Callback redirect hanya
menerima lokasi internal yang sudah ditentukan. Query callback dari URL login
tidak diteruskan ke redirect.

Limiter login membatasi 10 percobaan per email per 15 menit dalam satu proses.
Untuk deployment beberapa instance, tambahkan rate limiter bersama di gateway
atau Redis; limiter lokal tidak merupakan pembatas global. Aplikasi tidak
mencetak kredensial, cookie, hash, atau payload error driver.

## Menyiapkan akun Client dan Staff

1. Login sebagai Super Admin, buka **Akun & akses** di sidebar.
2. Buat akun CLIENT dan pilih data Client yang sudah ada, atau buat akun STAFF.
   Data Client dan Event tetap mengikuti alur pengelolaan data aplikasi; tidak
   dibuat otomatis oleh login/seed.
3. Untuk staff, buka detail event dari dashboard admin, pilih **Petugas acara**,
   lalu simpan penugasan. Staff dapat ditugaskan ke beberapa event.
4. Sampaikan password awal kepada pengguna melalui saluran pribadi.
5. Gunakan Edit pada akun untuk mengganti nama, role, client, atau password.
   Endpoint ini tidak mengubah akun SUPER_ADMIN dan tidak membuat admin baru.

## API

Semua endpoint di bawah memerlukan cookie session Auth.js. Respons memakai
`Cache-Control: private, no-store`. POST/PATCH/PUT wajib menyertakan
`Content-Type: application/json` dan header `Origin` yang sesuai.

| Endpoint | Akses / fungsi |
| --- | --- |
| `GET /api/events` | Semua role, hasil dibatasi scope; maksimal 100 event |
| `GET /api/events/:id` | Detail event dalam scope |
| `GET /api/checkins?eventId=...` | Daftar tamu/kehadiran dalam scope, maksimal 200 |
| `POST /api/checkins` | SUPER_ADMIN/STAFF; body `{ eventId, verificationToken, confirmed:true, count }` setelah `/api/checkins/verify`; lihat [Smart Check-in](./smart-checkin.md) |
| `GET /api/admin/users` | SUPER_ADMIN; atribut aman, maksimal 100 akun |
| `POST /api/admin/users` | SUPER_ADMIN; `{ name, email, password, role, clientId }` |
| `PATCH /api/admin/users/:id` | SUPER_ADMIN; `{ name, role, clientId, password? }` |
| `PUT /api/admin/events/:id/staff` | SUPER_ADMIN; `{ userIds: [...] }`, mengganti penugasan |
| `/api/auth/*` | Endpoint Auth.js untuk sesi/login/logout/CSRF |
| `GET /api/health` | Health check publik yang sudah ada |

CLIENT wajib memiliki `clientId`; STAFF menggunakan `clientId: null`.
Role pada API akun hanya CLIENT/STAFF. Untuk menghapus seluruh penugasan event,
kirim `userIds: []`. Dashboard client/staff menampilkan 20 event dan detail
menampilkan maksimal 100 tamu; statistik menghitung seluruh data yang diizinkan.
Dashboard admin, CRUD client/event, pagination, dan daftar staff dijelaskan di
[Client & Event Management](./client-event-management.md). Client nonaktif tidak
dapat login; staff kehilangan akses acara client nonaktif. Check-in hanya
tersedia ketika status acara dan client aktif.

## Pengujian manual

1. **Super Admin:** jalankan seed, login, pastikan menuju `/admin` dan dapat
   membuka Akun & akses serta seluruh event. Login salah menampilkan pesan
   generik tanpa menyatakan apakah email terdaftar.
2. **Client A/B:** buat dua Client dengan event berbeda dan akun masing-masing.
   Login di profil/incognito terpisah. Masing-masing hanya melihat event dan
   laporan sendiri; URL event client lain menghasilkan 404. `/admin` dan
   `/staff` mengarahkan kembali ke `/client`; API admin menghasilkan 403.
3. **Staff:** tugaskan ke satu event. Login menuju `/staff`, hanya event itu
   yang tersedia. Buka detail dan catat kode undangan dengan jumlah <= kuota.
   Percobaan kedua ditolak; event tanpa penugasan tidak dapat diakses.
4. **Logout:** klik Keluar, pastikan kembali ke `/login`; request API setelahnya
   menghasilkan 401. Dashboard private tidak dapat dibuka tanpa login.
5. **Perubahan akses:** cabut penugasan atau ubah role/password akun. Request
   baru kehilangan akses lama; perubahan akun mengharuskan login ulang.
6. **Mobile:** buka login pada lebar 390px; periksa input, tombol show/hide,
   loading state, error, serta navigasi dashboard.

## Pengujian otomatis

```bash
npm run test:auth
npm run lint
npx tsc --noEmit
npm run build
```

Pengujian HTTP end-to-end menggunakan akun, client, event, dan undangan sementara
dengan UUID unik. Data fixture dibersihkan pada akhir proses, termasuk saat
assertion gagal. Gunakan database development dan jangan mematikan proses secara
paksa agar cleanup berjalan. Test tidak memakai/mengubah akun asli.

Jalankan server di terminal terpisah. Jika `.env` berisi AUTH_URL, override ke
origin pengujian (PowerShell):

```powershell
$env:AUTH_URL = 'http://localhost:3100'
npm run start -- --port 3100
```

Terminal lain:

```powershell
npm run test:auth:e2e
```

Script memeriksa seed idempotent, login semua role, redirect role, logout,
anonymous 401, lintas role 403, isolasi client/staff 404, kuota dan konkurensi
check-in, CSRF API, pembatalan JWT setelah perubahan akun, manipulasi session,
open redirect, dan tidak adanya passwordHash pada respons.

Referensi: [Auth.js Credentials](https://authjs.dev/getting-started/authentication/credentials)
dan [Auth.js RBAC](https://authjs.dev/guides/role-based-access-control).
