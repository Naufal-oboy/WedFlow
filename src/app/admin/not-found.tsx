import Link from "next/link";
import { EmptyState, linkButton } from "@/components/dashboard/management-ui";
export default function NotFound() {
  return <EmptyState title="Data tidak ditemukan" description="Client atau acara yang diminta tidak tersedia."><Link className={linkButton} href="/admin">Kembali ke dashboard</Link></EmptyState>;
}
