import type { ReactNode } from "react";
import { DashboardShell } from "@/components/layout/dashboard-shell";
export default function Layout({ children }: { children: ReactNode }) { return <DashboardShell role="CLIENT">{children}</DashboardShell>; }
