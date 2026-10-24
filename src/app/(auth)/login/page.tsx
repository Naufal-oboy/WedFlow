import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Check, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { LoginForm } from "@/features/auth/login-form";
import { getCurrentUser } from "@/features/auth/access";
import { roleHome } from "@/features/auth/roles";
import { Card, CardContent } from "@/components/ui/card";

export const metadata = { title: "Masuk | WedFlow" };
export default function LoginPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-[#faf8f2] text-emerald-950">Menyiapkan halaman login...</main>}><LoginContent /></Suspense>;
}
async function LoginContent() {
  const user = await getCurrentUser();
  if (user) redirect(roleHome[user.role]);
  return <main className="wedflow-theme grid min-h-screen bg-[#faf8f2] text-stone-800 lg:grid-cols-[1.05fr_1fr]">
    <section className="relative hidden overflow-hidden bg-[#123e32] p-12 text-[#f9f6ee] lg:flex lg:flex-col xl:p-16">
      <Brand />
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-40 h-[570px] w-[420px] rounded-t-full border border-[#ccb67b]/20" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 top-56 h-[570px] w-[340px] rounded-t-full border border-[#ccb67b]/20" />
      <div className="relative my-auto max-w-lg py-24">
        <p className="mb-6 text-xs font-medium tracking-[0.28em] text-[#d9cba3] uppercase">Thoughtful moments. Seamless flow.</p>
        <h1 className="font-serif text-5xl leading-[1.15] xl:text-6xl">Setiap tamu berarti.<br /><span className="text-[#d9cba3] italic">Setiap momen terjaga.</span></h1>
        <p className="mt-8 max-w-sm text-base leading-7 text-emerald-50/70">Ruang kerja untuk merencanakan acara, menyambut tamu, dan merayakan hari istimewa dengan tenang.</p>
        <div className="mt-10 space-y-3 text-sm text-emerald-50/85">{["Seluruh acara dalam satu tempat", "Kolaborasi tim dengan akses yang tepat", "Penyambutan tamu yang lebih tertata"].map((text) => <p key={text} className="flex items-center gap-3"><Check className="size-4 text-[#d9cba3]" />{text}</p>)}</div>
      </div>
      <p className="relative text-xs text-emerald-50/50">Dibuat untuk cerita indah yang sedang Anda rencanakan.</p>
    </section>
    <section className="flex min-h-screen flex-col items-center justify-center px-6 py-10 sm:px-12">
      <div className="mb-12 text-emerald-900 lg:hidden"><Brand /></div>
      <div className="w-full max-w-sm">
        <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-[#ded5bc] bg-[#f3eedf] px-3 py-1.5 text-xs text-[#71613f]"><ShieldCheck className="size-3.5" /> Akses khusus tim & client</span>
        <h2 className="text-3xl font-semibold tracking-tight text-emerald-950">Selamat datang kembali</h2>
        <p className="mt-3 mb-8 text-sm leading-6 text-stone-500">Masuk untuk melanjutkan persiapan hari istimewa Anda.</p>
        <Card className="overflow-visible bg-transparent p-0 shadow-none ring-0"><CardContent className="p-0"><LoginForm /></CardContent></Card>
        <p className="mt-12 border-t border-stone-200 pt-6 text-center text-xs text-stone-400">WedFlow · Wedding Guest Management</p>
      </div>
    </section>
  </main>;
}
