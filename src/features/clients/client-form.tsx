"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { clientSchema, clientTypes } from "@/features/management/validation";
import { FormField, type FieldErrors } from "@/features/management/form-ui";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export function ClientForm({ client }: { client?: { id: string; name: string; email: string | null; phone: string | null; type: string } }) {
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = Object.fromEntries(new FormData(event.currentTarget));
    const result = clientSchema.safeParse(raw);
    if (!result.success) { setErrors(result.error.flatten().fieldErrors); return; }
    setPending(true); setErrors({}); setMessage("");
    try {
      const response = await fetch(client ? `/api/admin/clients/${client.id}` : "/api/admin/clients", { method: client ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(raw) });
      const data = await response.json();
      if (!response.ok) { setErrors(data.fields ?? {}); throw new Error(data.error ?? "Client gagal disimpan."); }
      toast.success("Client berhasil disimpan.");
      router.push(`/admin/clients/${data.client.id}`); router.refresh();
    } catch (error) { const text = error instanceof Error ? error.message : "Koneksi terganggu."; setMessage(text); toast.error(text); }
    finally { setPending(false); }
  }
  return <form onSubmit={submit} aria-busy={pending} className="max-w-2xl space-y-6 rounded-lg border border-border bg-white p-6 sm:p-8"><fieldset disabled={pending} className="grid gap-5 sm:grid-cols-2">
    <div className="sm:col-span-2"><FormField name="name" label="Nama client" errors={errors}><Input id="name" name="name" defaultValue={client?.name} required minLength={2} maxLength={120} aria-invalid={!!errors.name} aria-describedby="name-error" /></FormField></div>
    <FormField name="email" label="Email (opsional)" errors={errors}><Input id="email" name="email" type="email" defaultValue={client?.email ?? ""} maxLength={254} aria-invalid={!!errors.email} aria-describedby="email-error" /></FormField>
    <FormField name="phone" label="Telepon (opsional)" errors={errors}><Input id="phone" name="phone" type="tel" defaultValue={client?.phone ?? ""} maxLength={30} aria-invalid={!!errors.phone} aria-describedby="phone-error" /></FormField>
    <div className="sm:col-span-2"><FormField name="type" label="Jenis client" errors={errors}><select id="type" name="type" defaultValue={client?.type ?? "COUPLE"} className="min-h-11 w-full rounded-md border border-input bg-card px-3 text-base md:text-sm">{Object.entries(clientTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></FormField></div>
  </fieldset>{!client && <p className="text-sm text-muted-foreground">Client baru berstatus aktif. Akun login dapat dibuat melalui menu Akun & akses.</p>}{message && <p role="alert" className="text-sm text-red-700">{message}</p>}<div className="flex items-center gap-4"><Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan client"}</Button><Link className="text-sm text-muted-foreground hover:underline" href={client ? `/admin/clients/${client.id}` : "/admin/clients"}>Batal</Link></div></form>;
}
