"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="grid min-h-screen place-items-center bg-[#faf8f2] p-6"><div className="max-w-sm space-y-4"><h1 className="text-xl font-semibold">Halaman belum dapat dimuat</h1><p role="alert">Coba kembali atau hubungi petugas acara untuk dibantu.</p><Button onClick={reset} className="min-h-12">Coba lagi</Button></div></main>;
}
