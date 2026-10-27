# Client, Event, Staff & Admin Dashboard

## Audit dan keputusan implementasi

- Project tetap menggunakan Next.js App Router 16.4, Auth.js v5 dengan JWT, Prisma 7, PostgreSQL, dan komponen shadcn/ui berbasis Base UI.
- Model `Client`, `Event`, `User`, `Invitation`, dan relasi many-to-many `EventStaff` sudah tersedia. Tidak ada model duplikat atau reset database.
- Halaman dashboard tiga role, pengelolaan akun, API penugasan, dan check-in sudah ada. Modul ini memperluasnya melalui Route Handlers dan Server Components sesuai pola project.
- Client mendapat `type` (`COUPLE`, `WEDDING_ORGANIZER`) dan `status` (`ACTIVE`, `INACTIVE`). Migrasi aditif mempertahankan semua data lama dan memberi default `COUPLE` / `ACTIVE`. Jenis client lama dapat dikoreksi melalui form edit.
- Status event tetap berupa string pada database supaya migrasi tidak mengubah status historis. Semua penulisan melalui modul ini divalidasi menjadi `DRAFT`, `ACTIVE`, `COMPLETED`, atau `CANCELLED`.
- Tanggal dan jam di form, daftar, detail, serta filter menggunakan **WIB (Asia/Jakarta)**. Nilai disimpan sebagai instant UTC di field `eventDate` yang sudah ada. Batas akhir filter tanggal mencakup seluruh hari WIB.
- Pemilik event dipilih saat pembuatan dan tidak dapat dipindahkan melalui edit/API. Ini mencegah tamu, riwayat check-in, dan penugasan ikut berpindah antar-client.
- Tidak tersedia penghapusan permanen client/event. Nonaktifkan client atau ubah acara menjadi `CANCELLED` untuk mempertahankan relasi dan riwayat.

## Alur penggunaan

1. Login sebagai Super Admin, buka **Client**, lalu **Tambah client**.
2. Isi nama, email/telepon opsional, dan jenis. Client baru berstatus aktif.
3. Buka detail client untuk mengedit informasi, melihat acara, atau menonaktifkan/mengaktifkan layanan melalui dialog konfirmasi.
4. Pilih **Tambah acara**, isi client, nama, slug unik, tanggal, jam WIB, lokasi, dan status.
5. Buka detail acara, pilih petugas lalu simpan. Buat akun staff melalui **Akun & akses** bila belum tersedia.
6. Hapus centang staff lalu konfirmasi untuk mencabut akses. Staff dapat ditugaskan ke beberapa acara sekaligus.
7. Buka **Staff & penugasan** untuk mencari akun staff dan melihat acara penugasannya.
8. Dashboard admin menampilkan total client, total acara, jumlah acara mendatang, jumlah acara aktif, dan enam acara yang paling baru dibuat.

Total client/acara mencakup seluruh status. Acara mendatang berarti jadwal belum lewat, status `DRAFT`/`ACTIVE`, dan client aktif. Acara aktif berarti status `ACTIVE` dan client aktif, terlepas dari tanggal. Daftar client, acara, dan staff menggunakan 12 record per halaman; detail client menampilkan 10 acara terbaru dengan tautan ke daftar lengkap yang difilter.

## Otorisasi dan keamanan

- Setiap halaman admin memeriksa `requirePageRole("SUPER_ADMIN")`; API management memeriksa role kembali di server.
- Semua mutasi memeriksa Origin dan memvalidasi input dengan Zod; kegagalan validasi memberi respons 400 dengan error per field. Slug unik dilindungi oleh constraint database, termasuk permintaan serentak (409).
- Query client dan staff tetap memakai scope kepemilikan/penugasan. ID event client lain memberikan 404 tanpa membuka data.
- Penonaktifan mempertahankan client, event, undangan, akun, dan penugasan. Sesi client dicabut, login client diblokir, dan staff tidak dapat mengakses acara client nonaktif.
- Aktivasi ulang memungkinkan login baru dan mengembalikan akses penugasan staff yang masih tersimpan. Token client lama tetap tidak berlaku.
- Penugasan hanya menerima akun `STAFF`, maksimal 100 staff per acara. Perubahan memakai transaksi serializable, mempertahankan timestamp penugasan yang tidak berubah, dan hanya menghapus relasi yang dicabut.
- Client nonaktif tidak dapat menerima event baru atau penugasan baru. Admin masih dapat membaca dan memperbarui informasi historis atau mencabut penugasan.
- Check-in hanya diterima saat event dan client sama-sama aktif, sesuai PRD. Tidak ada override admin tanpa audit log. Status tidak aktif tidak menghapus check-in sebelumnya.
- Akun staff menggunakan model `User` dan pengelolaan akun yang sudah ada; daftar penugasan tidak menampilkan hash password.

## File yang dibuat atau diubah

| Area | File utama dan peran |
| --- | --- |
| Schema/migrasi | [schema.prisma](../prisma/schema.prisma), [migration.sql](../prisma/migrations/20261027010000_client_event_management/migration.sql): jenis/status client dan indeks pencarian event |
| Validasi/query | [validation.ts](../src/features/management/validation.ts), [queries.ts](../src/features/management/queries.ts): Zod, WIB, filter, pencarian, pagination |
| Client UI | [halaman client](../src/app/admin/clients), [form](../src/features/clients/client-form.tsx), [tombol status](../src/features/clients/client-status-button.tsx): daftar, tambah, edit, detail, konfirmasi status |
| Client API | [API client](../src/app/api/admin/clients): GET/POST daftar, GET/PATCH detail, PATCH status |
| Event UI/API | [halaman event](../src/app/admin/events), [form](../src/features/events/event-form.tsx), [API admin event](../src/app/api/admin/events): tambah/edit, filter, detail, staff |
| Staff | [daftar staff](../src/app/admin/staff/page.tsx), [form penugasan](../src/features/events/staff-assignment-form.tsx): pencarian, multi-event, konfirmasi pencabutan |
| Dashboard | [admin-overview.tsx](../src/components/dashboard/admin-overview.tsx), [admin/page.tsx](../src/app/admin/page.tsx), [event-detail.tsx](../src/components/dashboard/event-detail.tsx): statistik dan detail operasional |
| UI bersama | [management-ui.tsx](../src/components/dashboard/management-ui.tsx), [form-ui.tsx](../src/features/management/form-ui.tsx), [navigasi](../src/components/layout/dashboard-nav.tsx), [layout](../src/app/layout.tsx): tabel, empty state, badge, pagination, dialog, toast |
| Loading/error | [loading.tsx](../src/app/admin/loading.tsx), [error.tsx](../src/app/admin/error.tsx), [not-found.tsx](../src/app/admin/not-found.tsx): loading, retry, data tidak ditemukan |
| Keamanan | [auth.ts](../src/auth.ts), [scope.ts](../src/features/events/scope.ts), [api.ts](../src/lib/api.ts), [checkins/route.ts](../src/app/api/checkins/route.ts): client nonaktif, akses event, validasi, status check-in |
| Validasi otomatis | [management.test.ts](../tests/management.test.ts), [auth.test.ts](../tests/auth.test.ts), [test-auth-e2e.ts](../scripts/test-auth-e2e.ts), [package.json](../package.json): unit test dan integrasi HTTP dengan fixture sementara |
| Task lokal | [tasks.json](../.vscode/tasks.json): task build dan server pengujian produksi di port 3100 |

## Hasil verifikasi implementasi

Pada 27 Oktober 2026, migrasi berhasil diterapkan pada PostgreSQL lokal yang sudah dikonfigurasi. Prisma validation, TypeScript check, lint, dan build produksi lulus. Sebelas unit test (enam autentikasi, lima management) dan 141 assertion integrasi HTTP lulus; fixture uji dibersihkan. Perbandingan database dengan schema Prisma menghasilkan migrasi kosong (tanpa drift). Interaksi visual browser, fokus keyboard, dan tampilan mobile tetap tercakup dalam checklist manual di bawah, bukan klaim pengujian browser otomatis.

## Migrasi dan pemeriksaan

Gunakan koneksi database yang sudah ada. Perintah berikut tidak mereset database:

```powershell
npx prisma migrate status
npx prisma migrate deploy
npx prisma generate
npx prisma validate
npm run typecheck
npm run lint
npm run build
npm run test:auth
npm run test:management
```

Untuk pengujian HTTP, jalankan build terlebih dahulu, lalu server uji di terminal terpisah:

```powershell
$env:AUTH_URL = 'http://localhost:3100'
npm run start -- --port 3100
```

Di terminal lain:

```powershell
npm run test:auth:e2e
```

Suite integrasi memeriksa autentikasi, RBAC, isolasi event, check-in, halaman management, CRUD client/event, filter WIB, konflik slug, multi-event assignment, pencabutan, dan penonaktifan/aktivasi client. Fixture menggunakan UUID/prefix unik; cleanup hanya menghapus ID yang dibuat oleh suite. Jangan menghentikan paksa proses di tengah pengujian supaya blok cleanup dapat selesai.

## Pengujian manual per fitur

| Fitur | Langkah | Hasil yang diharapkan |
| --- | --- | --- |
| Daftar client | Buat lebih dari 12 client; cari potongan nama/email/telepon, pilih jenis/status, pindah halaman | Filter dikombinasikan, pagination mempertahankan filter, tombol Reset menghapus filter |
| Tambah client | Simpan nama valid dan kontak; coba nama kosong/email salah | Client valid muncul; input salah menampilkan error dan tidak tersimpan |
| Edit/detail client | Buka client, edit nama/kontak/jenis, kembali ke detail | Nilai terbaru dan jumlah acara/akun tampil benar |
| Nonaktifkan client | Login sebagai client/staff di sesi lain; nonaktifkan dan konfirmasi | Data tetap ada, sesi client dicabut, staff kehilangan akses acara, client tidak dapat login kembali |
| Aktivasi client | Aktifkan kembali; login ulang sebagai client dan refresh sesi staff | Client bisa login baru; penugasan staff yang tersimpan dapat diakses kembali |
| Tambah event | Pilih client aktif, isi nama/slug/tanggal/jam/lokasi/status | Tersimpan dan tampil pada daftar/detail client; jam konsisten WIB |
| Slug unik | Buat event kedua dengan slug sama | Muncul toast/error konflik; event pertama tidak berubah |
| Edit event | Ubah nama/jadwal/lokasi/status; konfirmasi perubahan status | Nilai tersimpan, client pemilik tetap, riwayat tamu/penugasan tetap |
| Filter event | Gabungkan client, status, tanggal awal/akhir; uji acara jam 00:30 WIB | Hasil sesuai hari WIB; rentang terbalik ditolak; pagination mempertahankan filter |
| Staff multi-event | Buat dua akun staff; tugaskan satu staff pada dua event | Daftar staff menampilkan dua penugasan; staff hanya melihat event yang ditugaskan |
| Cabut penugasan | Hilangkan centang pada satu event; batalkan lalu ulangi dan konfirmasi | Batal tidak menyimpan; konfirmasi mencabut akses segera, event lain tetap dapat diakses |
| Role dan isolasi | Gunakan sesi CLIENT/STAFF untuk URL admin dan API mutasi; coba ID event milik client lain | Halaman mengalihkan sesuai role; API 403; data event di luar scope 404 |
| Check-in/status | Coba check-in pada event draft/selesai/dibatalkan atau client nonaktif | Check-in diblokir server-side; status aktif mengizinkan sesuai penugasan/kuota |
| Dashboard | Tambah client/event, ubah jadwal/status, kembali ke ringkasan | Empat angka diperbarui dan acara terbaru muncul sesuai waktu pembuatan |
| Loading/empty/error | Perlambat jaringan, gunakan pencarian tanpa hasil, putus jaringan saat menyimpan | Loading/pending, empty state, toast/error, retry; tidak ada sukses palsu |
| Responsif/aksesibilitas | Uji lebar 375px dan desktop, navigasi dengan keyboard, buka/tutup dialog | Form menyesuaikan lebar, tabel dapat digulir, label terbaca, fokus dialog terkelola |
