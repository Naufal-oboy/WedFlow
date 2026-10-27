import assert from "node:assert/strict";
import { test } from "node:test";
import { compare } from "bcryptjs";
import { loginSchema, newPasswordSchema } from "../src/features/auth/validation";
import { safeAuthRedirect } from "../src/features/auth/roles";
import { hashPassword } from "../src/features/auth/password";
import { eventScope } from "../src/features/events/scope";
import { allowLoginAttempt, clearLoginAttempts } from "../src/features/auth/login-limit";
import { createAccountSchema } from "../src/features/auth/account-validation";

test("email normalization does not trim or alter passwords", () => {
  const input = loginSchema.parse({ email: " TEST@EXAMPLE.COM ", password: "  password  " });
  assert.equal(input.email, "test@example.com"); assert.equal(input.password, "  password  ");
  assert.equal(loginSchema.safeParse({ email: "invalid", password: "" }).success, false);
});
test("bcrypt byte limit and provisioning password length", async () => {
  assert.equal(newPasswordSchema.safeParse("short").success, false);
  assert.equal(newPasswordSchema.safeParse("é".repeat(37)).success, false);
  assert.equal(newPasswordSchema.safeParse("a".repeat(73)).success, false);
  const hash = await hashPassword("Strong test password!");
  assert.equal(await compare("Strong test password!", hash), true);
  assert.equal(await compare("wrong", hash), false);
});
test("redirects reject external, encoded, backslash and arbitrary destinations", () => {
  const origin = "https://wedflow.example";
  for (const url of ["https://evil.example", "//evil.example", "/\\evil.example", "/%2f%2fevil.example", "/api/auth/signout", "/admin?next=https://evil.example"]) {
    const target = new URL(safeAuthRedirect(url, origin));
    assert.equal(target.origin, origin); assert.equal(target.search, "");
  }
  assert.equal(safeAuthRedirect("/dashboard", origin), origin + "/dashboard");
});
test("client without ownership fails closed; staff is scoped by assignment", () => {
  const user = { id: "user", name: "Test", email: "test@example.com", clientId: null };
  assert.deepEqual(eventScope({ ...user, role: "CLIENT" }), { id: { in: [] } });
  assert.deepEqual(eventScope({ ...user, role: "STAFF" }), { client: { status: "ACTIVE" }, staffAssignments: { some: { userId: "user" } } });
});
test("account creation cannot promote to super admin or omit client ownership", () => {
  const base = { name: "Test", email: "test@example.com", password: "Strong test password!" };
  assert.equal(createAccountSchema.safeParse({ ...base, role: "SUPER_ADMIN" }).success, false);
  assert.equal(createAccountSchema.safeParse({ ...base, role: "CLIENT" }).success, false);
  assert.equal(createAccountSchema.safeParse({ ...base, role: "STAFF" }).success, true);
});
test("credential attempts are bounded and resettable", () => {
  const key = "unit-limit@example.com";
  for (let i = 0; i < 10; i++) assert.equal(allowLoginAttempt(key), true);
  assert.equal(allowLoginAttempt(key), false);
  clearLoginAttempts(key);
  assert.equal(allowLoginAttempt(key), true);
  clearLoginAttempts(key);
});
