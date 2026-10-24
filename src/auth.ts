import "server-only";
import NextAuth, { AuthError } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { compare, hash } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { loginSchema } from "@/features/auth/validation";
import { safeUserSelect } from "@/features/auth/user-select";
import { safeAuthRedirect } from "@/features/auth/roles";
import { allowLoginAttempt, clearLoginAttempts } from "@/features/auth/login-limit";

let dummyHash: Promise<string> | undefined;

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error("AUTH_SECRET wajib diatur, minimal 32 karakter.");

  return {
    secret,
    session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
    pages: { signIn: "/login", error: "/login" },
    // JWT credentials use our existing User model directly; no OAuth adapter tables needed.
    providers: [Credentials({
      credentials: { email: { type: "email" }, password: { type: "password" } },
      async authorize(credentials) {
        const parsed = loginSchema.safeParse(credentials);
        if (!parsed.success || !allowLoginAttempt(parsed.data.email)) return null;
        const { email, password } = parsed.data;
        const users = await prisma.user.findMany({
          where: { email: { equals: email, mode: "insensitive" } },
          select: { ...safeUserSelect, passwordHash: true }, take: 2,
        });
        const user = users.length === 1 ? users[0] : null;
        dummyHash ??= hash("invalid-account-comparison-only", 12);
        const valid = await compare(password, user?.passwordHash ?? await dummyHash);
        if (!user || !valid) return null;
        clearLoginAttempts(email);
        return {
          id: user.id, name: user.name, email: user.email, role: user.role,
          clientId: user.clientId, version: user.updatedAt.toISOString(),
        };
      },
    })],
    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          token.sub = user.id;
          token.version = user.version;
        }
        if (!token.sub) return null;
        const current = await prisma.user.findUnique({ where: { id: token.sub }, select: safeUserSelect });
        // A changed password, role, or account link invalidates existing JWTs immediately.
        if (!current || current.updatedAt.toISOString() !== token.version) return null;
        token.name = current.name;
        token.email = current.email;
        token.role = current.role;
        token.clientId = current.clientId;
        return token;
      },
      session({ session, token }) {
        session.user.id = token.sub!;
        session.user.name = token.name ?? "";
        session.user.email = token.email ?? "";
        session.user.role = token.role!;
        session.user.clientId = token.clientId ?? null;
        return session;
      },
      redirect({ url, baseUrl }) { return safeAuthRedirect(url, baseUrl); },
    },
    logger: {
      error(error) {
        // Auth.js error causes can contain raw DB errors; log only a safe category.
        const category = error instanceof AuthError ? error.type : "UnknownError";
        if (category !== "CredentialsSignin") console.error("Authentication error:", category);
      },
    },
  };
});
