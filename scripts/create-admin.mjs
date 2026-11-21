// Usage: node scripts/create-admin.mjs <email> [owner|moderator]
// Prompts for a password (not echoed). Re-running for an existing email resets the password and role.
import { randomBytes, scryptSync } from "node:crypto";
import postgres from "postgres";

const [email, role = "owner"] = process.argv.slice(2);
if (!email || !["owner", "moderator"].includes(role)) {
  console.error("usage: node scripts/create-admin.mjs <email> [owner|moderator]");
  process.exit(1);
}
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

async function readPassword(prompt) {
  if (process.env.ADMIN_PASSWORD) return process.env.ADMIN_PASSWORD;
  process.stdout.write(prompt);
  const stdin = process.stdin;
  stdin.setRawMode?.(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  let pw = "";
  return new Promise((resolve) => {
    stdin.on("data", (ch) => {
      if (ch === "\r" || ch === "\n" || ch === "\u0004") {
        stdin.setRawMode?.(false);
        stdin.pause();
        process.stdout.write("\n");
        resolve(pw);
      } else if (ch === "\u0003") process.exit(130);
      else if (ch === "\u007f") pw = pw.slice(0, -1);
      else pw += ch;
    });
  });
}

const password = await readPassword("Password (min 12 chars): ");
if (password.length < 12) {
  console.error("password too short");
  process.exit(1);
}

// Same format as src/lib/keys.ts hashPassword.
const salt = randomBytes(16);
const hash = `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
await sql`
  insert into admins (email, password_hash, role)
  values (${email.toLowerCase()}, ${hash}, ${role})
  on conflict (email) do update set password_hash = excluded.password_hash, role = excluded.role
`;
await sql.end();
console.log(`admin ${email} saved with role ${role}`);
