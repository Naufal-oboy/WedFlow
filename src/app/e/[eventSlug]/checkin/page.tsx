import { Suspense } from "react";
import { connection } from "next/server";
import { Brand } from "@/components/layout/brand";
import { publicEvent } from "@/features/precheckins/service";
import { slugSchema } from "@/features/precheckins/validation";
import { AccessError } from "@/lib/access-error";
import { PublicPrecheckinForm } from "@/features/precheckins/public-form";

export const metadata = { title: "Pre-check-in | WedFlow", robots: { index: false, follow: false }, referrer: "no-referrer" as const };
async function Content({ params }: { params: Promise<{ eventSlug: string }> }) {
  await connection();
  const slug = slugSchema.safeParse((await params).eventSlug);
  if (!slug.success) return <p role="alert">Pre-check-in tidak tersedia. Silakan hubungi petugas acara.</p>;
  let event;
  try { event = await publicEvent(slug.data); }
  catch (error) { if (error instanceof AccessError) return <p role="alert">{error.message}</p>; throw error; }
  return <><header className="space-y-4 border-b border-champagne pb-6"><p className="eyebrow text-warning">Selamat datang</p><h1 className="editorial-title">{event.name}</h1><p className="text-sm leading-6 text-muted-foreground">Kami senang menyambut Anda. Jika QR undangan tidak tersedia, isi nama untuk mendapatkan tiket verifikasi petugas.</p></header><PublicPrecheckinForm slug={event.slug} /></>;
}
export default function Page(props: { params: Promise<{ eventSlug: string }> }) {
  return <main className="wedflow-theme min-h-dvh bg-background px-5 py-8 text-foreground sm:py-14"><div className="mx-auto w-full max-w-lg"><div className="mb-10 text-primary"><Brand /></div><section className="space-y-7"><Suspense fallback={<div role="status" className="space-y-4"><div aria-hidden="true" className="h-24 animate-pulse rounded-lg bg-muted" /><p>Menyiapkan acara...</p></div>}><Content {...props} /></Suspense></section><footer className="mt-10 border-t border-champagne pt-5 text-xs leading-5 text-muted-foreground">Butuh bantuan? Silakan temui petugas di pintu masuk.</footer></div></main>;
}
