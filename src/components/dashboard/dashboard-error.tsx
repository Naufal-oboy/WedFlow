"use client";
import { Button } from "@/components/ui/button";

export function DashboardError({ reset }: { reset: () => void }) {
  return <section role="alert" className="surface space-y-4 border-l-4 border-l-destructive p-6 sm:p-8"><h1 className="text-xl font-semibold text-primary">Data belum dapat dimuat</h1><p className="max-w-md text-sm leading-6 text-muted-foreground">Terjadi kendala saat memuat data. Coba kembali beberapa saat lagi.</p><Button onClick={reset}>Coba lagi</Button></section>;
}
