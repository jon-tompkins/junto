import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/jon-tompkins/Agent-Reports/main';

// Simple markdown to HTML converter
function markdownToHtml(markdown: string): string {
  let html = markdown;

  // Images - convert relative paths to GitHub raw URLs
  html = html.replace(/!\[([^\]]*)\]\(\.\.\/charts\/([^)]+)\)/g,
    `<img class="chart-img" src="${GITHUB_RAW_BASE}/charts/$2" alt="$1" loading="lazy" />`);
  html = html.replace(/!\[([^\]]*)\]\(\.?\/?(charts\/[^)]+)\)/g,
    `<img class="chart-img" src="${GITHUB_RAW_BASE}/$2" alt="$1" loading="lazy" />`);
  html = html.replace(/!\[([^\]]*)\]\((?!http)([^)]+)\)/g,
    `<img class="chart-img" src="${GITHUB_RAW_BASE}/$2" alt="$1" loading="lazy" />`);
  // Keep absolute URLs as-is (including QuickChart URLs)
  html = html.replace(/!\[([^\]]*)\]\((https?:\/\/[^)]+)\)/g,
    `<img class="chart-img" src="$2" alt="$1" loading="lazy" />`);

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

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabase();

    // 1. Try Supabase first (new reports)
    const { data: dbReport } = await supabase
      .from('research_reports')
      .select('*')
      .eq('id', id)
      .single();

    if (dbReport) {
      if (dbReport.visibility !== 'public') {
        return NextResponse.json({ error: 'Report not available' }, { status: 403 });
      }

      return NextResponse.json({
        id: dbReport.id,
        title: dbReport.title,
        ticker: dbReport.ticker,
        summary: dbReport.summary,
        rating: dbReport.rating,
        type: dbReport.type,
        visibility: dbReport.visibility,
        date: dbReport.date,
        tags: dbReport.tags || [],
        content: markdownToHtml(dbReport.content),
      });
    }

    // 2. Fall back to GitHub (legacy reports)
    const indexRes = await fetch(`${GITHUB_RAW_BASE}/reports/index.json`, {
      next: { revalidate: 300 }
    });

    if (!indexRes.ok) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const indexData = await indexRes.json();
    const report = indexData.reports.find((r: any) => r.id === id);

    if (!report) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    if (report.visibility !== 'public') {
      return NextResponse.json({ error: 'Report not available' }, { status: 403 });
    }

    const contentRes = await fetch(`${GITHUB_RAW_BASE}/${report.path || report.file}`, {
      next: { revalidate: 300 }
    });

    if (!contentRes.ok) {
      return NextResponse.json({ error: 'Failed to fetch report content' }, { status: 500 });
    }

    const markdown = await contentRes.text();
    const content = markdownToHtml(markdown);

    return NextResponse.json({
      ...report,
      content
    });
  } catch (error) {
    console.error('Error fetching report:', error);
    return NextResponse.json({ error: 'Failed to fetch report' }, { status: 500 });
  }
}
