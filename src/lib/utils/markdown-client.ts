/**
 * Lightweight markdown to HTML converter for client-side use.
 * Handles the common patterns in newsletter content.
 */
export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Images
  html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
    '<img class="chart-img" src="$2" alt="$1" loading="lazy" />');

  // Headers
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // @handle → link to X profile
  html = html.replace(/(?<!["\w])@([A-Za-z0-9_]{1,15})(?!["\w])/g,
    '<a href="https://x.com/$1" target="_blank" rel="noopener" style="color: #3b82f6;">@$1</a>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Lists
  html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Paragraphs — wrap lines separated by double newlines
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs and paragraphs wrapping block elements
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<hr>)/g, '$1');
  html = html.replace(/(<hr>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<img)/g, '$1');
  html = html.replace(/(\/>\s*)<\/p>/g, '$1');

  return html;
}
