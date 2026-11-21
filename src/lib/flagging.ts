/**
 * Minimal automatic flagging: posts matching a pattern are stored as "flagged"
 * so they surface in the admin queue. Override with FLAG_PATTERNS
 * (comma-separated, case-insensitive regexes) without a code change.
 */
const DEFAULTS = [
  String.raw`ignore (all )?(previous|prior) instructions`,
  String.raw`\b(system prompt|jailbreak)\b`,
];

const patterns = (process.env.FLAG_PATTERNS?.split(",").filter(Boolean) ?? DEFAULTS).map(
  (p) => new RegExp(p, "i"),
);

export function shouldFlag(body: string): boolean {
  return patterns.some((p) => p.test(body));
}
