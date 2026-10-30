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
  return <><p className="text-xs tracking-widest text-[#806a3b] uppercase">Selamat datang</p><h1 className="break-words text-2xl font-semibold text-emerald-950">{event.name}</h1><p className="text-sm text-stone-600">Lupa membawa QR undangan? Petugas siap membantu.</p><PublicPrecheckinForm slug={event.slug} /></>;
}
export default function Page(props: { params: Promise<{ eventSlug: string }> }) {
  return <main className="wedflow-theme flex min-h-screen justify-center bg-[#faf8f2] px-4 py-10 text-stone-800"><div className="w-full max-w-md space-y-8"><div className="text-emerald-950"><Brand /></div><section className="space-y-5 rounded-2xl border border-[#d8c79e] bg-white p-5 sm:p-8"><Suspense fallback={<p role="status">Menyiapkan acara...</p>}><Content {...props} /></Suspense></section></div></main>;
}
