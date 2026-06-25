// Extract cashtags ($XXX) from dispatch text. Mirrors the render regex in
// markdown-client.ts: a $ followed by 1-6 uppercase letters, not part of a
// larger word and not a dollar amount ($1.5B). Returns de-duplicated, ordered.
export function extractTickers(text: string | null | undefined): string[] {
  if (!text) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /(^|[^\w$])\$([A-Z]{1,6})(?![A-Za-z0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const t = m[2];
    if (!seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}
