import { Suspense, type ReactNode } from "react";

export function DashboardLoading() {
  return <div role="status" aria-live="polite" className="space-y-6" aria-busy="true"><p className="text-sm text-muted-foreground">Memuat data WedFlow...</p><div className="h-9 w-56 motion-safe:animate-pulse rounded-md bg-border" /><div className="grid gap-4 sm:grid-cols-3">{[1, 2, 3].map((i) => <div key={i} className="h-28 motion-safe:animate-pulse rounded-md bg-muted" />)}</div><div className="h-72 motion-safe:animate-pulse rounded-md bg-muted" /></div>;
}

// Layout boundaries are reused during sibling navigation. Keep uncached page
// data behind a boundary inside the destination page as well.
export function DashboardPage({ children }: { children: ReactNode }) {
  return <Suspense fallback={<DashboardLoading />}>{children}</Suspense>;
}
