import "dotenv/config";

async function main() {
  const { prisma } = await import("../src/lib/prisma");

  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log("Koneksi PostgreSQL melalui Prisma berhasil.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  // Do not print connection URLs or credentials from driver errors.
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "UNKNOWN";
  console.error(`Koneksi database gagal (${code}). Periksa DATABASE_URL dan akses PostgreSQL.`);
  process.exitCode = 1;
});
