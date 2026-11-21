import { createHash, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number) => Promise<Buffer>;

/** Visitor tokens are 256-bit random, so unsalted SHA-256 is fine for lookup. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

const ADJ = ["quiet", "amber", "brisk", "silver", "hidden", "lucky", "mossy", "velvet", "rusty", "sleepy", "bold", "misty", "frosty", "gentle", "wild", "dusky", "nimble", "sunny", "hollow", "crimson"];
const NOUN = ["otter", "heron", "lynx", "badger", "falcon", "marten", "newt", "wren", "sparrow", "moth", "fox", "raven", "beetle", "ibis", "koi", "gecko", "hare", "vole", "puffin", "tapir"];

export function newHandle(): string {
  return `${ADJ[randomInt(ADJ.length)]}-${NOUN[randomInt(NOUN.length)]}-${randomInt(10, 1000)}`;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, saltHex, hashHex] = stored.split("$");
  if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, "hex");
  const actual = await scryptAsync(password, Buffer.from(saltHex, "hex"), expected.length);
  return timingSafeEqual(actual, expected);
}
