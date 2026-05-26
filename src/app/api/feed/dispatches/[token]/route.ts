import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/db/client';
import { listPersonalDispatchesWithAudio } from '@/lib/db/personal-dispatches';

export const dynamic = 'force-dynamic';

const SITE_URL = process.env.NEXTAUTH_URL || 'https://www.myjunto.xyz';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const rawToken = token.replace(/\.xml$/, '');

  if (!rawToken || rawToken.length < 16) {
    return new NextResponse('Not found', { status: 404 });
  }

  const supabase = getSupabase();
  const { data: user } = await supabase
    .from('users')
    .select('id, display_name')
    .eq('feed_token', rawToken)
    .maybeSingle();

  if (!user) {
    return new NextResponse('Not found', { status: 404 });
  }

  const dispatches = await listPersonalDispatchesWithAudio(user.id, 50);
  const xml = buildPodcastXml({
    userName: user.display_name || 'Junto',
    feedUrl: `${SITE_URL}/api/feed/dispatches/${rawToken}.xml`,
    dispatches,
  });

  return new NextResponse(xml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=300',
    },
  });
}

interface DispatchRow {
  id: string;
  dispatch_date: string;
  subject: string;
  content: string;
  audio_url: string | null;
  audio_bytes: number | null;
  audio_duration_sec: number | null;
  created_at: string;
}

function buildPodcastXml(args: {
  userName: string;
  feedUrl: string;
  dispatches: DispatchRow[];
}): string {
  const title = `${args.userName}'s Junto Brief`;
  const description = `Daily intelligence brief — narrated.`;
  const lastBuild = args.dispatches[0]?.created_at || new Date().toISOString();
  const cover = `${SITE_URL}/og-image.png`;

  const items = args.dispatches
    .filter((d) => d.audio_url)
    .map((d) => {
      const pubDate = new Date(d.created_at).toUTCString();
      const summary = escapeXml(stripMarkdown(d.content).slice(0, 1200));
      return `    <item>
      <title>${escapeXml(d.subject)}</title>
      <description><![CDATA[${markdownToHtml(d.content)}]]></description>
      <itunes:summary>${summary}</itunes:summary>
      <pubDate>${pubDate}</pubDate>
      <guid isPermaLink="false">junto-dispatch-${d.id}</guid>
      <enclosure url="${escapeXml(d.audio_url!)}" length="${d.audio_bytes ?? 0}" type="audio/mpeg"/>
      <itunes:duration>${d.audio_duration_sec ?? 0}</itunes:duration>
      <itunes:explicit>false</itunes:explicit>
    </item>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"
  xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"
  xmlns:content="http://purl.org/rss/1.0/modules/content/"
  xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeXml(title)}</title>
    <link>${SITE_URL}</link>
    <atom:link href="${escapeXml(args.feedUrl)}" rel="self" type="application/rss+xml"/>
    <description>${escapeXml(description)}</description>
    <language>en-us</language>
    <lastBuildDate>${new Date(lastBuild).toUTCString()}</lastBuildDate>
    <itunes:author>Junto</itunes:author>
    <itunes:summary>${escapeXml(description)}</itunes:summary>
    <itunes:owner>
      <itunes:name>Junto</itunes:name>
      <itunes:email>noreply@myjunto.xyz</itunes:email>
    </itunes:owner>
    <itunes:explicit>false</itunes:explicit>
    <itunes:category text="Business">
      <itunes:category text="Investing"/>
    </itunes:category>
    <itunes:image href="${escapeXml(cover)}"/>
    <image>
      <url>${escapeXml(cover)}</url>
      <title>${escapeXml(title)}</title>
      <link>${SITE_URL}</link>
    </image>
${items}
  </channel>
</rss>`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripMarkdown(md: string): string {
  return md
    .replace(/^#+\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^-\s+/gm, '• ')
    .replace(/\n{2,}/g, '\n\n')
    .trim();
}

function markdownToHtml(md: string): string {
  // Minimal — show readable text in podcast app show notes
  let html = md;
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  html = html.replace(/^-\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/\n\n/g, '</p><p>');
  return `<p>${html}</p>`;
}
