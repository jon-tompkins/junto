const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/jon-tompkins/Agent-Reports/main';

/**
 * Simple markdown to HTML converter for research reports.
 * Handles images (with GitHub raw URL resolution), headers, bold/italic,
 * code blocks, links, tables, lists, and paragraphs.
 */
export function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Images — handle absolute URLs first (QuickChart URLs may contain parens)
  html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^\s]*)\)/g,
    `<img class="chart-img" src="$2" alt="$1" style="max-width:100%;height:auto;border-radius:8px;margin:16px 0;" loading="lazy" />`);
  // Images - convert relative paths to GitHub raw URLs
  html = html.replace(/!\[([^\]]*)\]\(\.\.\/charts\/([^)]+)\)/g,
    `<img class="chart-img" src="${GITHUB_RAW_BASE}/charts/$2" alt="$1" style="max-width:100%;height:auto;border-radius:8px;margin:16px 0;" loading="lazy" />`);
  html = html.replace(/!\[([^\]]*)\]\(\.?\/?(charts\/[^)]+)\)/g,
    `<img class="chart-img" src="${GITHUB_RAW_BASE}/$2" alt="$1" style="max-width:100%;height:auto;border-radius:8px;margin:16px 0;" loading="lazy" />`);
  html = html.replace(/!\[([^\]]*)\]\((?!http)([^)]+)\)/g,
    `<img class="chart-img" src="${GITHUB_RAW_BASE}/$2" alt="$1" style="max-width:100%;height:auto;border-radius:8px;margin:16px 0;" loading="lazy" />`);

  // Handle <div> tags passthrough
  html = html.replace(/<div class="charts-row">/g, '<div class="charts-row">');
  html = html.replace(/<\/div>/g, '</div>');

  // Headers
  html = html.replace(/^### (.*$)/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');

  // Code blocks
  html = html.replace(/```[\w]*\n([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Horizontal rules
  html = html.replace(/^---$/gm, '<hr>');

  // Tables (basic)
  html = html.replace(/^\|(.+)\|$/gm, (match, content) => {
    const cells = content.split('|').map((c: string) => c.trim());
    const isHeader = cells.some((c: string) => c.match(/^-+$/));
    if (isHeader) return '';
    const tag = 'td';
    return '<tr>' + cells.map((c: string) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
  });
  html = html.replace(/(<tr>.*<\/tr>\n?)+/g, '<table>$&</table>');

  // Lists
  html = html.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Numbered lists
  html = html.replace(/^\s*\d+\.\s+(.*)$/gm, '<li>$1</li>');

  // Paragraphs
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean up
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<table>)/g, '$1');
  html = html.replace(/(<\/table>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<hr>)/g, '$1');
  html = html.replace(/(<hr>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<img)/g, '$1');
  html = html.replace(/(\/>\s*)<\/p>/g, '$1');

  return html;
}
