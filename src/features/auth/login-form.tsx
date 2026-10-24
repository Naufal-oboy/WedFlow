"use client";

import { useActionState, useState } from "react";
import { ArrowRight, Eye, EyeOff, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loginAction } from "./actions";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, {});
  const [showPassword, setShowPassword] = useState(false);
  return <form action={action} className="space-y-6" aria-busy={pending}>
    <div className="space-y-2.5">
      <Label htmlFor="email">Alamat email</Label>
      <Input id="email" name="email" type="email" required autoComplete="username" maxLength={254} placeholder="nama@perusahaan.com" className="h-12 bg-white" disabled={pending} aria-invalid={!!state.fields?.email} aria-describedby={state.fields?.email ? "email-error" : undefined} />
      {state.fields?.email && <p id="email-error" className="text-sm text-red-700">{state.fields.email[0]}</p>}
    </div>
    <div className="space-y-2.5">
      <Label htmlFor="password">Password</Label>
      <div className="relative">
        <Input id="password" name="password" type={showPassword ? "text" : "password"} required maxLength={72} autoComplete="current-password" placeholder="Masukkan password Anda" className="h-12 bg-white pr-12" disabled={pending} aria-invalid={!!state.fields?.password} aria-describedby={state.fields?.password ? "password-error" : undefined} />
        <Button type="button" variant="ghost" size="icon" className="absolute top-2 right-2 text-stone-500" onClick={() => setShowPassword(!showPassword)} aria-label={showPassword ? "Sembunyikan password" : "Tampilkan password"} aria-pressed={showPassword} disabled={pending}>{showPassword ? <EyeOff /> : <Eye />}</Button>
      </div>
      {state.fields?.password && <p id="password-error" className="text-sm text-red-700">{state.fields.password[0]}</p>}
    </div>
    {state.error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{state.error}</p>}
    <Button type="submit" className="h-12 w-full bg-emerald-900 text-white hover:bg-emerald-800" disabled={pending}>
      {pending ? <><LoaderCircle className="animate-spin" /> Memproses...</> : <>Masuk ke dashboard <ArrowRight className="ml-2 size-4" /></>}
    </Button>
    <p className="text-center text-xs leading-5 text-stone-500">Belum memiliki akses atau lupa password?<br />Hubungi administrator WedFlow Anda.</p>
  </form>;
}
