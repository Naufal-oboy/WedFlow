import { Suspense } from "react";
import { GuestListPage } from "@/features/guests/guest-pages";
import GuestLoading from "./loading";

export default function Page(props: Parameters<typeof GuestListPage>[0]) {
  return <Suspense fallback={<GuestLoading />}><GuestListPage {...props} /></Suspense>;
}
