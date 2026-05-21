/**
 * Lightweight markdown to HTML converter for client-side use.
 * Handles the common patterns in newsletter content.
 */
export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Escaped newlines from model output
  html = html.replace(/\r\n/g, '\n');

  // Semantic callouts (restrained visual blocks)
  html = html.replace(/^>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|BULL|BEAR|WATCH)\]\s*(.*)$/gim, (_m, kind, content) => {
    const tone = String(kind).toLowerCase();
    return `<div class="brief-callout brief-callout-${tone}"><div class="brief-callout-label">${kind}</div><div>${content}</div></div>`;
  });

  // Section labels / summary badges
  html = html.replace(/^\*\*(Executive View|The Signal|Where They Converge|Crosscurrents|Desk Notes|Tradecraft|What\'s Moving)\*\*$/gm, '<h2>$1</h2>');
  html = html.replace(/\b(Key takeaway|Bullish|Bearish|Neutral|Watch|Risk):/g, '<span class="brief-chip brief-chip-$1">$1</span>');

  // Images
  html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
    '<img class="chart-img" src="$2" alt="$1" loading="lazy" />');

  // Headers
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

  // Blockquotes
  html = html.replace(/^>\s?(.*)$/gm, '<blockquote>$1</blockquote>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Inline semantic chips
  html = html.replace(/\b(Bullish|Bearish|Neutral|Watch|Risk|Key takeaway):/g, '<span class="brief-chip brief-chip-$1">$1</span>');

  // Code blocks
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Tickers → subtle pills
  html = html.replace(/(^|[^\w])\$([A-Z]{1,6})(?!\w)/g, '$1<span class="ticker-pill">$$$2</span>');

  // @handle → link to X profile
  html = html.replace(/(?<!["\w>])@([A-Za-z0-9_]{1,15})(?!["\w<])/g,
    '<a href="https://x.com/$1" target="_blank" rel="noopener" class="handle-link">@$1</a>');

  // Lists
  html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Paragraphs — wrap lines separated by double newlines
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs and paragraphs wrapping block elements
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[1-6]|<ul>|<hr>|<pre>|<img|<blockquote|<div)/g, '$1');
  html = html.replace(/(<\/h[1-6]>|<\/ul>|<hr>|<\/pre>|\/>|<\/blockquote>|<\/div>)\s*<\/p>/g, '$1');

  return html;
}
