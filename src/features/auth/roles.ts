import type { Role } from "@/generated/prisma/enums";

export const roleHome: Record<Role, string> = {
  SUPER_ADMIN: "/admin", CLIENT: "/client", STAFF: "/staff",
};
export const roleLabel: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin", CLIENT: "Client", STAFF: "Staff",
};

// Only these fixed destinations are accepted, including for direct Auth.js requests.
export function safeAuthRedirect(url: string, baseUrl: string) {
  const base = new URL(baseUrl);
  try {
    const destination = new URL(url, base);
    if (destination.origin === base.origin &&
      ["/login", "/dashboard", ...Object.values(roleHome)].includes(destination.pathname)) {
      return `${base.origin}${destination.pathname}`;
    }
  } catch { /* Fall through to the role dispatcher. */ }
  return `${base.origin}/dashboard`;
}
