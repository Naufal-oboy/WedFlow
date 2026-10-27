"use client";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type FieldErrors = Record<string, string[] | undefined>;
export function FormField({ name, label, errors, children }: { name: string; label: string; errors: FieldErrors; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label>{children}{errors[name]?.[0] && <p id={`${name}-error`} role="alert" className="text-xs text-red-700">{errors[name]![0]}</p>}</div>;
}
export function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, pending = false }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; onConfirm: () => void; pending?: boolean }) {
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}><DialogContent className="wedflow-theme" showCloseButton={!pending}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader><DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Batal</Button><Button onClick={onConfirm} disabled={pending}>{pending ? "Menyimpan..." : "Konfirmasi"}</Button></DialogFooter></DialogContent></Dialog>;
}
