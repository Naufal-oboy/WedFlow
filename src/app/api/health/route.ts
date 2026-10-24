import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json({
      status: "ok",
      message: "WedFlow database connected",
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    unstable_rethrow(error);
    console.error("Database health check failed.");

    return NextResponse.json(
      {
        status: "error",
        message: "Database unavailable",
      },
      { status: 503 }
    );
  }
}
