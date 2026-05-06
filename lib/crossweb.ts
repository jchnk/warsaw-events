import { WarsawEvent } from '@/types/event';

// Crossweb has a dedicated Warsaw RSS feed — no need to filter by city
const CROSSWEB_WARSAW_RSS = 'https://crossweb.pl/rss/wydarzenia/warszawa/';

function extractCdata(block: string, tag: string): string {
  const cdataMatch = block.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`));
  if (cdataMatch) return cdataMatch[1].trim();
  const plainMatch = block.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`));
  return plainMatch ? plainMatch[1].trim() : '';
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

export async function fetchCrosswebEvents(): Promise<WarsawEvent[]> {
  try {
    const res = await fetch(CROSSWEB_WARSAW_RSS, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
      next: { revalidate: 1800 },
    });

    if (!res.ok) throw new Error(`Crossweb RSS HTTP ${res.status}`);
    const xml = await res.text();

    const itemBlocks = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
    const events: WarsawEvent[] = [];
    const now = Date.now() - 24 * 60 * 60 * 1000;

    for (const [, block] of itemBlocks) {
      const title = extractCdata(block, 'title');
      // <link> in RSS 2.0 is often between tags (not CDATA), preceded by </title>
      const link = extractCdata(block, 'link') ||
        (block.match(/<link>(https?:\/\/[^<]+)<\/link>/)?.[1]?.trim() ?? '');
      const pubDate = extractCdata(block, 'pubDate');
      const description = extractCdata(block, 'description');

      if (!title || !link) continue;

      // Parse RFC 2822 date (e.g. "Wed, 20 May 2026 18:00:00 +0200")
      const startDate = pubDate ? new Date(pubDate).toISOString() : '';
      if (!startDate) continue;
      if (new Date(startDate).getTime() < now) continue;

      const descText = stripHtml(description).slice(0, 400);
      const slug = link.replace(/https?:\/\/crossweb\.pl\//, '').replace(/[^a-z0-9]/gi, '-').slice(0, 60);

      events.push({
        id: `crossweb-${slug}`,
        title,
        description: descText,
        startDate,
        location: 'Warszawa',
        url: link,
        source: 'crossweb',
        isFree: undefined, // Crossweb has both free and paid events
      });
    }

    console.log(`[Crossweb RSS] Found ${events.length} Warsaw events`);
    return events;
  } catch (err) {
    console.error('[Crossweb RSS]', err);
    return [];
  }
}
