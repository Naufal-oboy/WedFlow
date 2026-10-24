import { randomBytes } from "node:crypto";
import { appendFileSync, readFileSync, existsSync } from "node:fs";
import { parse } from "dotenv";

const existing = existsSync(".env") ? readFileSync(".env", "utf8") : "";
const local = existsSync(".env.local") ? parse(readFileSync(".env.local", "utf8")) : {};
if (process.env.AUTH_SECRET || parse(existing).AUTH_SECRET || local.AUTH_SECRET) {
  console.log("AUTH_SECRET sudah tersedia; nilainya tidak diubah.");
} else {
  appendFileSync(".env", `\nAUTH_SECRET="${randomBytes(32).toString("base64url")}"\n`);
  console.log("AUTH_SECRET dibuat di .env lokal tanpa ditampilkan.");
}
