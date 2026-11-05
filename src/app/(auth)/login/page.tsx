import { Suspense } from "react";
import { redirect } from "next/navigation";

import { Brand } from "@/components/layout/brand";
import { LoginForm } from "@/features/auth/login-form";
import { getCurrentUser } from "@/features/auth/access";
import { roleHome } from "@/features/auth/roles";


export const metadata = { title: "Masuk | WedFlow" };
export default function LoginPage() {
  return <Suspense fallback={<main className="grid min-h-screen place-items-center bg-background text-primary">Menyiapkan halaman login...</main>}><LoginContent /></Suspense>;
}
async function LoginContent() {
  const user = await getCurrentUser();
  if (user) redirect(roleHome[user.role]);
  return <main className="wedflow-theme grid min-h-screen bg-background text-foreground lg:grid-cols-[1.05fr_1fr]">
    <section className="relative hidden overflow-hidden bg-sidebar p-12 text-sidebar-foreground lg:flex lg:flex-col xl:p-16">
      <Brand />
      <div className="relative my-auto max-w-lg py-24">
        <p className="mb-6 text-xs font-medium tracking-[0.28em] text-champagne uppercase">WedFlow · Operasional acara</p>
        <p className="font-editorial-heading text-5xl leading-[1.15] xl:text-6xl">Setiap tamu berarti.<br /><span className="text-champagne italic">Setiap momen terjaga.</span></p>
        <p className="mt-8 max-w-sm text-base leading-7 text-sidebar-foreground/80">Ruang kerja untuk merencanakan acara, menyambut tamu, dan merayakan hari istimewa dengan tenang.</p>
      </div>
      <p className="relative text-xs text-sidebar-foreground/80">Acara, undangan, dan penerimaan tamu.</p>
    </section>
    <section className="flex min-h-screen flex-col items-center justify-center px-6 py-10 sm:px-12">
      <div className="mb-12 text-primary lg:hidden"><Brand /></div>
      <div className="w-full max-w-sm">
        <p className="eyebrow mb-6">Akses tim & client</p>
        <h1 className="text-3xl font-semibold tracking-tight text-primary">Selamat datang kembali</h1>
        <p className="mt-3 mb-8 text-sm leading-6 text-muted-foreground">Masuk untuk mengelola acara dan penerimaan tamu.</p>
        <LoginForm />
        <p className="mt-12 border-t border-border pt-6 text-center text-xs text-muted-foreground">WedFlow · Wedding Guest Management</p>
      </div>
    </section>
  </main>;
}
