"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createAccountSchema, updateAccountSchema } from "./account-validation";
import { roleLabel } from "./roles";
import type { Role } from "@/generated/prisma/enums";

type Account = { id: string; name: string; email: string; role: Role; clientId: string | null };
export function AccountManager({ accounts, clients }: { accounts: Account[]; clients: { id: string; name: string }[] }) {
  const [editing, setEditing] = useState<Account | null>(null);
  const [role, setRole] = useState("STAFF");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [formKey, setFormKey] = useState(0);
  const router = useRouter();
  function select(account: Account | null) { setEditing(account); setRole(account?.role ?? "STAFF"); setMessage(""); setFormKey((key) => key + 1); }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const input = { name: data.get("name"), email: data.get("email"), password: data.get("password") || (editing ? undefined : ""), role, clientId: role === "CLIENT" ? data.get("clientId") : null };
    const parsed = (editing ? updateAccountSchema : createAccountSchema).safeParse(input);
    if (!parsed.success) { setMessage(parsed.error.issues[0]?.message ?? "Periksa input akun."); return; }
    setPending(true); setMessage("");
    try {
      const response = await fetch(editing ? `/api/admin/users/${editing.id}` : "/api/admin/users", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const result = await response.json();
      if (response.ok) { select(null); setMessage("Akun berhasil disimpan."); router.refresh(); }
      else setMessage(result.error ?? "Akun belum dapat disimpan.");
    } catch { setMessage("Koneksi terganggu. Coba lagi."); }
    finally { setPending(false); }
  }
  return <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
    <section className="space-y-3" aria-label="Daftar akun">{accounts.map((account) => <div key={account.id} className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-white p-5"><div className="min-w-0"><p className="font-medium">{account.name}</p><p className="break-all text-sm text-muted-foreground">{account.email}</p><p className="mt-2 text-xs text-primary">{roleLabel[account.role]}</p></div>{account.role !== "SUPER_ADMIN" && <Button variant="outline" disabled={pending} onClick={() => select(account)}>Edit</Button>}</div>)}</section>
    <form key={formKey} onSubmit={submit} className="h-fit space-y-4 rounded-lg border border-border bg-white p-6" aria-busy={pending}>
      <h2 className="font-semibold">{editing ? "Edit akun" : "Buat akun"}</h2>
      <div className="space-y-2"><Label htmlFor="account-name">Nama</Label><Input id="account-name" name="name" defaultValue={editing?.name} required maxLength={100} disabled={pending} /></div>
      <div className="space-y-2"><Label htmlFor="account-email">Email</Label><Input id="account-email" name="email" type="email" defaultValue={editing?.email} required maxLength={254} disabled={pending || !!editing} /></div>
      <div className="space-y-2"><Label htmlFor="account-password">{editing ? "Password baru (opsional)" : "Password awal"}</Label><Input id="account-password" name="password" type="password" autoComplete="new-password" required={!editing} minLength={12} maxLength={72} disabled={pending} /><p className="text-xs text-muted-foreground">Minimal 12 karakter, maksimal 72 byte. Sampaikan password melalui saluran pribadi.</p></div>
      <div className="space-y-2"><Label htmlFor="account-role">Role</Label><select id="account-role" value={role} onChange={(event) => setRole(event.target.value)} className="min-h-11 w-full rounded-md border border-input bg-card px-3 text-base md:text-sm" disabled={pending}><option value="STAFF">Staff</option><option value="CLIENT">Client</option></select></div>
      {role === "CLIENT" && <div className="space-y-2"><Label htmlFor="account-client">Pemilik acara</Label><select id="account-client" name="clientId" defaultValue={editing?.clientId ?? ""} required disabled={pending} className="min-h-11 w-full rounded-md border border-input bg-card px-3 text-base md:text-sm"><option value="" disabled>Pilih client</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select>{!clients.length && <p className="text-xs text-muted-foreground">Belum ada data client. Buat data Client terlebih dahulu.</p>}</div>}
      <Button type="submit" disabled={pending}>{pending ? "Menyimpan..." : "Simpan akun"}</Button>{editing && <Button type="button" variant="ghost" onClick={() => select(null)} disabled={pending}>Batal</Button>}
      {message && <p role="status" className="text-sm">{message}</p>}
    </form>
  </div>;
}
