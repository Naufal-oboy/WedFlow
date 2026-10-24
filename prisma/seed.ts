import "dotenv/config";
import { bootstrapSuperAdmin } from "../src/features/auth/bootstrap";
import { prisma } from "../src/lib/prisma";

async function main() {
  const status = await bootstrapSuperAdmin({
    email: process.env.SUPER_ADMIN_EMAIL,
    password: process.env.SUPER_ADMIN_PASSWORD,
    name: process.env.SUPER_ADMIN_NAME || "Super Admin",
  });
  console.log(status === "created" ? "Super Admin berhasil dibuat." : "Super Admin sudah tersedia; akun tidak diubah.");
}
main().catch(() => {
  console.error("Seed gagal. Periksa SUPER_ADMIN_EMAIL, SUPER_ADMIN_PASSWORD (12 karakter hingga 72 byte), koneksi database, dan konflik akun. Kredensial tidak ditampilkan.");
  process.exitCode = 1;
}).finally(() => prisma.$disconnect());
