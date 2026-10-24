"use client";
import { useFormStatus } from "react-dom";
import { LogOut, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logoutAction } from "@/features/auth/actions";

function Submit() {
  const { pending } = useFormStatus();
  return <Button type="submit" variant="outline" disabled={pending}>{pending ? <LoaderCircle className="animate-spin" /> : <LogOut />} {pending ? "Keluar..." : "Keluar"}</Button>;
}
export function LogoutButton() { return <form action={logoutAction}><Submit /></form>; }
