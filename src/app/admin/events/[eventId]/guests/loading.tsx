export default function GuestLoading() {
  return <div role="status" aria-label="Memuat daftar tamu" className="space-y-6"><span className="sr-only">Memuat undangan...</span><div className="h-10 w-64 animate-pulse rounded-lg bg-stone-200" /><div className="h-24 animate-pulse rounded-2xl bg-stone-100" /><div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">{Array.from({ length: 6 }, (_, index) => <div key={index} className="h-12 animate-pulse rounded-lg bg-stone-100" />)}</div></div>;
}
