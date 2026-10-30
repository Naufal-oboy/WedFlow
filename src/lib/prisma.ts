import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error("DATABASE_URL belum diatur di environment server.");
  }

  const databaseUrl = new URL(connectionString);
  const schema = databaseUrl.searchParams.get("schema") ?? "public";
  // Prisma's DateTime wire values must be interpreted as UTC, including on
  // databases whose default session timezone is not UTC. Apply to every pooled
  // connection and preserve any other configured PostgreSQL startup options.
  databaseUrl.searchParams.set("options", `${databaseUrl.searchParams.get("options") ?? ""} -c timezone=UTC`.trim());
  const adapter = new PrismaPg(
    { connectionString: databaseUrl.toString(), connectionTimeoutMillis: 10_000 },
    { schema },
  );

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
