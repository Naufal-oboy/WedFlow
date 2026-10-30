<div align="center">

# 💍 WedFlow

### Smart Wedding Guest Management & Check-in Platform

**Kelola acara pernikahan, undangan, dan kehadiran tamu dalam satu platform.**

![Status](https://img.shields.io/badge/status-in%20development-f59e0b?style=flat-square)
![Next.js](https://img.shields.io/badge/Next.js-App%20Router-000000?style=flat-square&logo=nextdotjs)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-2D3748?style=flat-square&logo=prisma)

</div>

## 📖 Tentang WedFlow

**WedFlow** adalah platform manajemen tamu pernikahan berbasis web yang dirancang untuk membantu penyedia jasa buku tamu digital, pasangan pengantin, dan wedding organizer mengelola undangan serta proses kedatangan tamu dengan lebih efisien.

WedFlow menggunakan pendekatan **managed service**: penyedia jasa mengelola banyak klien dan acara melalui satu dashboard, sementara petugas menangani proses check-in di lokasi acara.

Autentikasi email/password, JWT session, RBAC server, dashboard tiga role,
pengelolaan akun, penugasan staff, dan check-in manual berdasarkan kode undangan
sudah diimplementasikan. Panduan lengkap ada di
[Authentication & RBAC](./docs/authentication.md).

Pengelolaan client dan acara, filter/pagination, penugasan staff, serta ringkasan
admin tersedia di dashboard. Lihat [panduan Client & Event Management](./docs/client-event-management.md)
untuk keputusan implementasi, daftar file, migrasi aman, dan langkah pengujian.

QR Invitation Generation tersedia melalui **Kelola tamu & QR** di detail event:
tambah/edit tamu, impor CSV dengan preview, QR unik, download PNG, dan print
undangan. Akses dibatasi untuk Super Admin; token tidak berisi data pribadi dan
kompatibel dengan check-in yang sudah ada. Lihat [panduan QR Invitation](./docs/qr-invitation.md)
untuk format token, keamanan, penanganan kode lama, dan pengujian.

Pengelolaan tamu dan undangan per acara, pencarian/filter/pagination, detail,
edit kuota, penghapusan sebelum check-in, serta impor CSV dengan preview dan
konfirmasi tersedia untuk Super Admin. Lihat [Guest & Invitation Management](./docs/guest-management.md).

Keunggulan utama WedFlow adalah **alur check-in alternatif ketika tamu tidak membawa atau lupa QR undangan**, sehingga proses penerimaan tamu tidak sepenuhnya bergantung pada satu metode verifikasi.

Sprint 5 menyediakan Smart Name Search toleran typo, scanner kamera, input kode
manual, dan dialog verifikasi petugas. Kehadiran keluarga dapat dicatat bertahap
sesuai sisa kuota, dengan riwayat, transaksi atomik, dan retry idempotent.
Lihat [Smart Check-in](./docs/smart-checkin.md) untuk migrasi `pg_trgm`, perubahan
kontrak API (verify lalu confirm), pengujian, dan panduan HP melalui HTTPS.

Sprint 6 menyediakan QR umum per event, halaman publik tanpa login, tiket
sementara 20 menit, dan antrean verifikasi petugas. Respons publik tidak
mengungkap apakah nama terdaftar. Check-in tetap melalui transaksi dan kuota
yang sama; rate limiter publik menggunakan PostgreSQL lintas instance.
Lihat [Public QR Pre-check-in](./docs/public-precheckin.md) untuk konfigurasi
origin, batas permintaan, lifecycle tiket, dan pengujian.

> **Status pengembangan:** Project masih dalam tahap pembangunan. Fitur yang dijelaskan di bawah merupakan cakupan produk yang direncanakan; ketersediaan setiap fitur perlu diperiksa pada implementasi terbaru.

## ✨ Fitur Utama

### 🏢 Manajemen Klien & Acara
- Mengelola data pasangan pengantin dan wedding organizer.
- Membuat serta mengelola beberapa acara dari satu dashboard.
- Menentukan tanggal, lokasi, status acara, dan petugas yang bertugas.
- Membatasi akses data sesuai peran pengguna.

### 💌 Manajemen Tamu & Undangan
- Mengelola daftar tamu undangan.
- Menentukan kuota kehadiran individu atau keluarga/grup.
- Menghasilkan kode undangan unik dan QR personal.
- Menyiapkan impor data tamu dari CSV/Excel sebagai fitur pengembangan.

### 📲 Smart Guest Check-in
WedFlow dirancang mendukung **tiga jalur check-in**:

| Metode | Alur |
| --- | --- |
| **Personal QR** | Petugas memindai QR unik pada undangan tamu dan memverifikasi kehadiran. |
| **Smart Name Search** | Jika QR terlupa, petugas mencari nama tamu lalu memverifikasi identitas dan kuota sebelum check-in. |
| **Public QR Pre-check-in** | Tamu memindai QR umum di lokasi, mengisi identitas, lalu memperoleh pass sementara untuk diverifikasi petugas. |

Sistem dirancang untuk mencegah check-in ganda dan mencatat riwayat verifikasi.

### 📊 Dashboard & Laporan
- Ringkasan jumlah tamu terdaftar dan hadir.
- Statistik kehadiran per acara.
- Pemantauan aktivitas check-in secara real-time *(direncanakan)*.
- Ekspor laporan kehadiran *(direncanakan)*.

## 👥 Role Pengguna

| Role | Tanggung jawab |
| --- | --- |
| **Super Admin** | Mengelola seluruh klien, acara, pengguna, petugas, dan laporan platform. |
| **Client** | Melihat acara dan informasi kehadiran yang menjadi hak aksesnya. |
| **Staff** | Memverifikasi undangan dan melakukan check-in pada acara yang ditugaskan. |
| **Guest** | Menunjukkan QR undangan atau menggunakan alur pre-check-in tanpa akun. |

## 🔄 Alur Check-in

```mermaid
flowchart TD
    A[Tamu tiba di lokasi] --> B{Memiliki QR undangan?}
    B -->|Ya| C[Petugas scan QR personal]
    B -->|Tidak| D{Pilih metode alternatif}
    D --> E[Petugas mencari nama tamu]
    D --> F[Tamu scan QR publik]
    F --> G[Isi data pre-check-in]
    G --> H[Pass sementara]
    E --> I[Verifikasi petugas]
    H --> I
    C --> I
    I --> J{Data valid dan kuota tersedia?}
    J -->|Ya| K[Catat kehadiran]
    J -->|Tidak| L[Tinjau atau tolak check-in]
    K --> M[Dashboard diperbarui]
```

## 🛠️ Tech Stack

| Kategori | Teknologi |
| --- | --- |
| Framework | Next.js (App Router) |
| Bahasa | TypeScript |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui (Base UI) |
| Database | PostgreSQL |
| ORM | Prisma 7 |
| Authentication | Auth.js / NextAuth (Credentials Provider) |
| Password Hashing | bcryptjs |
| Validasi | Zod |
| QR Code | `qrcode` untuk generate; `jsQR` untuk decoder scanner kamera |

## 📁 Struktur Project

Contoh struktur yang dituju; dapat berbeda sesuai perkembangan repository:

```text
wedflow/
├── prisma/
│   ├── schema.prisma
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── api/
│   │   ├── (auth)/
│   │   ├── admin/
│   │   ├── client/
│   │   └── staff/
│   ├── components/
│   │   └── ui/
│   ├── features/
│   ├── generated/
│   │   └── prisma/
│   └── lib/
│       └── prisma.ts
├── prisma.config.ts
├── .env.example
├── package.json
└── README.md
```

## 🚀 Menjalankan Project Secara Lokal

### Prasyarat

- Node.js versi LTS yang kompatibel dengan Next.js dan Prisma pada project.
- npm.
- PostgreSQL yang berjalan secara lokal atau melalui server database.
- Git.

### 1. Clone repository

```bash
git clone https://github.com/USERNAME/REPOSITORY.git
cd REPOSITORY
```

> Ganti `USERNAME/REPOSITORY` dengan URL repository WedFlow yang sebenarnya.

### 2. Install dependencies

```bash
npm install
```

### 3. Buat database PostgreSQL

Buat database bernama `wedflow_db` melalui pgAdmin atau PostgreSQL CLI:

```sql
CREATE DATABASE wedflow_db;
```

### 4. Atur environment variables

Buat file `.env` di root project:

```dotenv
DATABASE_URL="postgresql://postgres:YOUR_PASSWORD@localhost:5432/wedflow_db?schema=public"
AUTH_SECRET=""
AUTH_URL="http://localhost:3000"
SUPER_ADMIN_EMAIL=""
SUPER_ADMIN_PASSWORD=""
SUPER_ADMIN_NAME="Super Admin"
```

Gunakan [.env.example](./.env.example) sebagai acuan. Pertahankan koneksi database
yang sudah ada. Kosongkan AUTH_SECRET sebelum menjalankan generator di bawah;
generator mempertahankan secret yang sudah terisi. Jangan pernah commit `.env`.

Untuk membuat secret Auth.js, gunakan:

```bash
npm run auth:secret
```

### 5. Jalankan migrasi dan generate Prisma Client

```bash
npx prisma migrate deploy
npx prisma generate
```

Perintah di atas menerapkan migrasi yang sudah tersedia. Gunakan `migrate dev`
hanya saat membuat migrasi baru di lingkungan development. Jangan menjalankan reset.

Isi `SUPER_ADMIN_EMAIL` dan `SUPER_ADMIN_PASSWORD` pada `.env` lokal (password
minimal 12 karakter, maksimal 72 byte), kemudian buat Super Admin pertama:

```bash
npm run db:seed
```

Seed aman dijalankan ulang: tidak mengganti password atau membuat admin duplikat.
Secret dan password tidak dicetak ke terminal.

### 6. Jalankan development server

```bash
npm run dev
```

Buka **http://localhost:3000** di browser.

Login di **http://localhost:3000/login**. Super Admin diarahkan ke `/admin`,
Client ke `/client`, dan Staff ke `/staff`. Admin dapat membuat akun melalui
`/admin/users` dan menugaskan staff melalui detail event.

Jalankan `npm run test:auth`, `npm run lint`, dan `npm run build` untuk validasi.
Pengujian HTTP seluruh role tersedia melalui `npm run test:auth:e2e`; cara
menjalankan server uji dan skenario manual ada di
[panduan pengujian](./docs/authentication.md#pengujian-otomatis).

### 7. Opsional: Periksa database

```bash
npx prisma studio
```

## 🔐 Keamanan

Prinsip keamanan yang diterapkan atau ditargetkan dalam pengembangan:

- Password disimpan dalam bentuk hash, bukan plaintext.
- Autentikasi dan otorisasi diperiksa di sisi server.
- Hak akses dibatasi berdasarkan role dan kepemilikan/penugasan acara.
- Validasi input menggunakan Zod.
- QR personal menggunakan kode unik; pass sementara memiliki masa berlaku terbatas.
- Proses check-in harus memeriksa kuota dan mencegah pencatatan ganda.
- Data sensitif dan secret disimpan di environment variables.
- Aktivitas penting dapat dicatat melalui audit log.

## 🗺️ Roadmap

Status berikut merupakan **rencana pengembangan**, bukan klaim bahwa semua modul telah selesai.

- [x] Inisialisasi project Next.js dan konfigurasi PostgreSQL/Prisma.
- [x] Pembuatan database dan migrasi awal.
- [x] Authentication dan Role-Based Access Control (RBAC).
- [x] Dashboard awal Super Admin, Client, dan Staff.
- [x] CRUD Client dan Event Management.
- [x] Penugasan staff ke event.
- [x] Daftar, tambah/edit tamu, kuota, dan impor CSV dengan preview.
- [ ] Impor Excel.
- [x] Pembuatan QR undangan personal, download PNG, dan print.
- [x] Pemindaian QR undangan personal melalui kamera dengan konfirmasi petugas.
- [x] Smart Name Search untuk tamu tanpa QR.
- [x] Check-in bertahap, riwayat kedatangan, proteksi kuota dan replay.
- [x] Public QR Pre-check-in dan tiket sementara dengan verifikasi petugas.
- [ ] Dashboard kehadiran real-time dan laporan.
- [ ] Pengujian keamanan, performa, dan deployment.
- [ ] Dukungan offline-first *(pengembangan lanjutan)*.

> Perbarui checklist berdasarkan fitur yang benar-benar telah selesai dan diuji di repository.

## 🎯 Tujuan Project

WedFlow dikembangkan untuk:

1. Mempercepat proses penerimaan tamu di acara pernikahan.
2. Mengurangi hambatan saat tamu lupa membawa QR undangan.
3. Membantu penyedia jasa mengelola banyak klien dan event secara terpusat.
4. Menyediakan data kehadiran yang lebih terstruktur dan mudah dilaporkan.
5. Menjadi fondasi layanan buku tamu digital yang dapat dikembangkan secara komersial.

## 📄 Lisensi

Lisensi belum ditentukan. Seluruh hak cipta tetap mengikuti ketentuan pemilik repository sampai file lisensi ditambahkan.

---

<div align="center">

**WedFlow — Every Guest, Seamlessly Welcomed.**

*Built to make wedding guest management simpler, faster, and more organized.*

</div>
