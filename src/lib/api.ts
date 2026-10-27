import "server-only";
import { unstable_rethrow } from "next/navigation";
import { ZodError } from "zod";
import { AccessError } from "@/features/auth/access";

export function apiJson(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
}
export async function apiHandler(work: () => Promise<Response>) {
  try { return await work(); }
  catch (error) {
    unstable_rethrow(error);
    if (error instanceof AccessError) return apiJson({ error: error.message }, error.status);
    if (error instanceof ZodError) return apiJson({ error: "Periksa kembali isian form.", fields: error.flatten().fieldErrors }, 400);
    if (error instanceof SyntaxError) return apiJson({ error: "Input tidak valid." }, 400);
    if (typeof error === "object" && error !== null && "code" in error) {
      if (error.code === "P2002") return apiJson({ error: "Data unik (slug atau email) sudah digunakan. Gunakan nilai lain." }, 409);
      if (error.code === "P2034") return apiJson({ error: "Data berubah saat disimpan. Muat ulang dan coba lagi." }, 409);
      if (error.code === "P2003" || error.code === "P2025") return apiJson({ error: "Data terkait tidak ditemukan." }, 404);
    }
    console.error("API request failed.");
    return apiJson({ error: "Permintaan belum dapat diproses." }, 500);
  }
}

export function requireSameOrigin(request: Request) {
  const expected = new URL(process.env.AUTH_URL ?? request.url).origin;
  if (request.headers.get("origin") !== expected) throw new AccessError(403, "Asal permintaan tidak diizinkan.");
}
