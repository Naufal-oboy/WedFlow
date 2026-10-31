export default function GuestLoading() {
  return <div role="status" aria-label="Memuat daftar tamu" className="space-y-6"><span className="sr-only">Memuat undangan...</span><div className="h-10 w-64 animate-pulse rounded-lg bg-border" /><div className="h-24 animate-pulse rounded-lg bg-muted" /><div className="space-y-3 rounded-lg border border-border bg-white p-5">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-muted" />)}</div></div>;
}
