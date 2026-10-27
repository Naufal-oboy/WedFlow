import { Suspense } from "react";
import { GuestDetailPage } from "@/features/guests/guest-pages";
import GuestLoading from "../loading";

export default function Page(props: Parameters<typeof GuestDetailPage>[0]) {
  return <Suspense fallback={<GuestLoading />}><GuestDetailPage {...props} /></Suspense>;
}
