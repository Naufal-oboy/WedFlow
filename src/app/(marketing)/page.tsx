import Link from "next/link";
import { Brand } from "@/components/layout/brand";
import { linkButton } from "@/components/dashboard/management-ui";

export default function Home() {
  return <main className="grid min-h-dvh place-items-center px-4 py-12 sm:px-8">
    <div className="w-full max-w-lg space-y-6">
      <Brand />
      <h1 className="editorial-title">Ruang kerja acara Anda.</h1>
      <p className="text-sm leading-6 text-muted-foreground">Kelola acara, undangan, dan penerimaan tamu bersama tim WedFlow.</p>
      <Link href="/dashboard" className={linkButton}>Buka ruang kerja</Link>
      <p className="border-t pt-5 text-sm text-muted-foreground">Untuk akses akun, hubungi administrator Anda.</p>
    </div>
  </main>;
}
