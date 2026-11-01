"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="grid min-h-dvh place-items-center bg-background p-6"><div className="max-w-sm space-y-4"><p className="eyebrow">WedFlow · Penerimaan tamu</p><h1 className="editorial-title">Halaman belum dapat dimuat</h1><p role="alert" className="text-sm leading-6 text-muted-foreground">Coba kembali atau hubungi petugas acara untuk dibantu.</p><Button onClick={reset} className="min-h-12">Coba lagi</Button></div></main>;
}
