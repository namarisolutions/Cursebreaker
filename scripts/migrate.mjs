// Applies SQL migrations from ./drizzle. Runs as Railway's pre-deploy command.
//
// First-admin bootstrap: if ADMIN_EMAIL and ADMIN_PASSWORD are set and no admin exists yet,
// an owner account is created. It never changes an existing admin, so after the first deploy
// you can (and should) delete ADMIN_PASSWORD from the environment.
import { randomBytes, scryptSync } from "node:crypto";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
const client = postgres(process.env.DATABASE_URL, { max: 1, onnotice: () => {} });
await migrate(drizzle(client), { migrationsFolder: "./drizzle" });
console.log("migrations applied");

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
if (email && password) {
  const [{ n }] = await client`select count(*)::int as n from admins`;
  if (n > 0) {
    console.log("admin bootstrap skipped: an admin already exists");
  } else if (password.length < 12) {
    console.error("admin bootstrap skipped: ADMIN_PASSWORD must be at least 12 characters");
  } else {
    // Same format as src/lib/keys.ts hashPassword.
    const salt = randomBytes(16);
    const hash = `scrypt$${salt.toString("hex")}$${scryptSync(password, salt, 64).toString("hex")}`;
    await client`insert into admins (email, password_hash, role) values (${email}, ${hash}, 'owner')`;
    console.log(`admin bootstrap: created owner ${email}. You can now remove ADMIN_PASSWORD from the environment.`);
  }
}
await client.end();
