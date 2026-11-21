import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/**
 * Transcript encryption. Each visitor's words are encrypted with a key derived from
 * their cookie token, which exists only in their browser (the database stores just a
 * hash of it). So the database, backups, and the admin dashboard hold ciphertext only:
 * a transcript can be decrypted only during a request from that visitor's browser.
 *
 * If the visitor clears their cookies, their transcript becomes unreadable to everyone.
 * The AI summaries the owner sees are unaffected.
 */

const VERSION = "v1";

export function transcriptKey(token: string, visitorId: string): Buffer {
  return Buffer.from(hkdfSync("sha256", token, "cursebreaker-transcript", visitorId, 32));
}

export function seal(key: Buffer, plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return [VERSION, iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ct.toString("base64url")].join(".");
}

export function open(key: Buffer, sealed: string): string | null {
  const [v, iv, tag, ct] = sealed.split(".");
  if (v !== VERSION || !iv || !tag || ct === undefined) return null;
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64url"));
    d.setAuthTag(Buffer.from(tag, "base64url"));
    return Buffer.concat([d.update(Buffer.from(ct, "base64url")), d.final()]).toString("utf8");
  } catch {
    return null;
  }
}
