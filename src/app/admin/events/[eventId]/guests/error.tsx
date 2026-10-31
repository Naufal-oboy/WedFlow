"use client";
import { Button } from "@/components/ui/button";

export default function GuestError({ reset }: { reset: () => void }) {
  return <section role="alert" className="space-y-4 rounded-lg border border-border bg-white p-8"><h1 className="text-xl font-semibold text-primary">Undangan belum dapat dimuat</h1><p className="text-sm text-muted-foreground">Terjadi kendala saat memuat data tamu. Silakan coba kembali.</p><Button onClick={reset}>Coba lagi</Button></section>;
}
