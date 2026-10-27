"use client";
import { Button } from "@/components/ui/button";

export default function GuestError({ reset }: { reset: () => void }) {
  return <section role="alert" className="space-y-4 rounded-2xl border border-stone-200 bg-white p-8"><h1 className="text-xl font-semibold text-emerald-950">Undangan belum dapat dimuat</h1><p className="text-sm text-stone-500">Terjadi kendala saat memuat data tamu. Silakan coba kembali.</p><Button onClick={reset}>Coba lagi</Button></section>;
}
