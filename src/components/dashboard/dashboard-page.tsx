import { Suspense, type ReactNode } from "react";

export function DashboardLoading() {
  return <div role="status" aria-live="polite" className="space-y-6"><p className="text-sm text-stone-500">Memuat data WedFlow...</p><div className="h-9 w-56 animate-pulse rounded-lg bg-stone-200" /><div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-stone-100" />)}</div><div className="h-72 animate-pulse rounded-2xl bg-stone-100" /></div>;
}

// Layout boundaries are reused during sibling navigation. Keep uncached page
// data behind a boundary inside the destination page as well.
export function DashboardPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<DashboardLoading />}>{children}</Suspense>;
}
