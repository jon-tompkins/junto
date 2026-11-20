/** Plain-text preview of a dispatch body. Drops markdown so the homepage
 * card stays a short excerpt of the real run, not the raw source. */
export function dispatchExcerpt(markdown: string, max = 520): string {
  const text = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]*\)/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/[*_~`>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  const clipped = (sp > max * 0.6 ? cut.slice(0, sp) : cut).trim();
  return `${clipped}…`;
}
