"use client";
import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

export type FieldErrors = Record<string, string[] | undefined>;
export function FormField({ name, label, errors, children }: { name: string; label: string; errors: FieldErrors; children: ReactNode }) {
  return <div className="space-y-2"><Label htmlFor={name}>{label}</Label>{children}{errors[name]?.[0] && <p id={`${name}-error`} role="alert" className="text-xs text-red-700">{errors[name]![0]}</p>}</div>;
}
export function ConfirmDialog({ open, onOpenChange, title, description, onConfirm, pending = false, destructive = false, confirmLabel = "Konfirmasi", error }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; onConfirm: () => void; pending?: boolean; destructive?: boolean; confirmLabel?: string; error?: string }) {
  return <Dialog open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}><DialogContent className="wedflow-theme" showCloseButton={!pending} initialFocus={(type) => type === "touch" ? false : document.querySelector<HTMLButtonElement>('[data-confirm-cancel]')}><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>{error && <p role="alert" className="rounded-lg bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}<DialogFooter><Button data-confirm-cancel variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Batal</Button><Button variant={destructive ? "destructive" : "default"} onClick={onConfirm} disabled={pending}>{pending ? "Menyimpan..." : confirmLabel}</Button></DialogFooter></DialogContent></Dialog>;
}
