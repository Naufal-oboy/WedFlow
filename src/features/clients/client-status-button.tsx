"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/features/management/form-ui";

export function ClientStatusButton({ id, active }: { id: string; active: boolean }) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function confirm() {
    setPending(true);
    try {
      const response = await fetch(`/api/admin/clients/${id}/status`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: active ? "INACTIVE" : "ACTIVE" }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Status gagal diubah.");
      toast.success(active ? "Client dinonaktifkan." : "Client diaktifkan."); setOpen(false); router.refresh();
    } catch (error) { toast.error(error instanceof Error ? error.message : "Koneksi terganggu."); }
    finally { setPending(false); }
  }
  return <><Button variant={active ? "destructive" : "outline"} onClick={() => setOpen(true)}>{active ? "Nonaktifkan client" : "Aktifkan client"}</Button><ConfirmDialog open={open} onOpenChange={setOpen} pending={pending} onConfirm={confirm} title={active ? "Nonaktifkan client?" : "Aktifkan kembali client?"} description={active ? "Akun client dan akses staff ke acara client ini akan diblokir. Semua acara, penugasan, dan riwayat tamu tetap tersimpan." : "Client dapat login kembali dan staff dapat mengakses acara penugasannya."} /></>;
}
