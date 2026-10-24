import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/features/auth/access";
import { roleHome } from "@/features/auth/roles";

export default function Page() { return <Suspense fallback={<p className="p-8">Membuka dashboard...</p>}><Dispatch /></Suspense>; }
async function Dispatch() { const user = await getCurrentUser(); return redirect(user ? roleHome[user.role] : "/login"); }
