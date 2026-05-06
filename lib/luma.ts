import { WarsawEvent } from '@/types/event';

// Warsaw place ID — stable identifier for the Warsaw city discovery page
const WARSAW_PLACE_ID = 'discplace-PTcuEQVHuySJe8N';
const API_BASE = 'https://api.lu.ma/discover/get-paginated-events';
const MAX_PAGES = 4; // up to 200 featured Warsaw events

// ── Main fetcher ──────────────────────────────────────────────────────────────

export async function fetchLumaEvents(): Promise<WarsawEvent[]> {
  try {
    const entries = await fetchAllPages();
    if (entries.length === 0) return await fetchLumaHtmlFallback();

    const now = Date.now() - 24 * 60 * 60 * 1000;
    const events = entries
      .map(mapLumaEntry)
      .filter((e): e is WarsawEvent => e !== null)
      .filter(e => new Date(e.startDate).getTime() >= now);

    // Sort: featured events first, then by Luma's relevance score desc
    const withMeta = entries.map((entry, i) => ({
      featured: !!entry.featured_city,
      score: (entry.score ?? 0) as number,
      idx: i,
    }));
    events.sort((a, b) => {
      const ma = withMeta.find(m => `luma-${entries[m.idx]?.event?.api_id}` === a.id);
      const mb = withMeta.find(m => `luma-${entries[m.idx]?.event?.api_id}` === b.id);
      if (!ma || !mb) return 0;
      if (ma.featured !== mb.featured) return ma.featured ? -1 : 1;
      return mb.score - ma.score;
    });

    console.log(`[Luma API] ${events.length} events (${events.filter(e => e.id).length} mapped)`);
    return events;
  } catch (err) {
    console.error('[Luma API]', err);
    return fetchLumaHtmlFallback();
  }
}

async function fetchAllPages(): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const params = new URLSearchParams({
      placeApiId: WARSAW_PLACE_ID,
      pagination_limit: '50',
    });
    if (cursor) params.set('pagination_cursor', cursor);

    const res = await fetch(`${API_BASE}?${params}`, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      next: { revalidate: 1800 },
    });

    if (!res.ok) throw new Error(`Luma API ${res.status}`);
    const data = await res.json();

    const entries: any[] = data.entries ?? [];
    all.push(...entries);

    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return all;
}

// ── Entry mapper ──────────────────────────────────────────────────────────────

function mapLumaEntry(entry: any): WarsawEvent | null {
  const event = entry?.event;
  if (!event?.name || !event?.start_at) return null;

  const geo = event.geo_address_info ?? {};
  const pl = geo.localized?.pl ?? {};
  const locationStr = pl.address || geo.address || geo.city_state || 'Warszawa';
  const fullAddress = pl.full_address || geo.full_address;

  const ticket = entry.ticket_info ?? {};
  const isFree = ticket.is_free ?? true;
  // price is { cents: number, currency: string } or null
  const priceCents = ticket.price?.cents;
  const priceCurrency = (ticket.price?.currency ?? ticket.currency ?? 'PLN').toUpperCase();
  const price = !isFree && priceCents != null
    ? `${(priceCents / 100).toFixed(0)} ${priceCurrency}`
    : undefined;

  const cal = entry.calendar ?? {};
  const slug = event.url ?? event.api_id;
  const eventUrl = `https://lu.ma/${slug}`;

  return {
    id: `luma-${event.api_id}`,
    title: event.name,
    description: '',
    startDate: new Date(event.start_at).toISOString(),
    endDate: event.end_at ? new Date(event.end_at).toISOString() : undefined,
    location: locationStr,
    address: fullAddress,
    url: eventUrl,
    imageUrl: event.cover_url ?? undefined,
    source: 'luma',
    isFree,
    price,
    organizer: cal.name && cal.name !== 'Personal' ? cal.name : undefined,
    attendeeCount: entry.guest_count ?? undefined,
  };
}

// ── HTML fallback (in case API is unavailable) ────────────────────────────────

async function fetchLumaHtmlFallback(): Promise<WarsawEvent[]> {
  try {
    const res = await fetch('https://lu.ma/warsaw', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'pl,en;q=0.8',
      },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const html = await res.text();

    // Try JSON-LD
    const match = html.match(
      /type="application\/ld\+json"[^>]*>\s*(\{[\s\S]*?"@type"\s*:\s*"ItemList"[\s\S]*?)\s*<\/script>/
    );
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const items: any[] = data.itemListElement ?? [];
    const now = Date.now() - 24 * 60 * 60 * 1000;

    return items.map(mapLumaJsonLd).filter((e): e is WarsawEvent => {
      return e !== null && new Date(e.startDate).getTime() >= now;
    });
  } catch {
    return [];
  }
}

function mapLumaJsonLd(item: any): WarsawEvent | null {
  const e = item.item ?? item;
  if (!e?.name || !e?.startDate) return null;

  const loc = e.location ?? {};
  const addr = loc.address ?? {};
  const locationStr =
    loc.name ??
    [addr.streetAddress, addr.addressLocality].filter(Boolean).join(', ') ??
    'Warszawa';

  const offer = e.offers?.[0] ?? {};
  const isFree = !offer.price || offer.price === 0;
  const price = !isFree ? `${offer.price} ${(offer.priceCurrency ?? 'PLN').toUpperCase()}` : undefined;
  const organizer = Array.isArray(e.organizer) ? e.organizer[0]?.name : e.organizer?.name;

  // JSON-LD image is an array; take the first (square) image — don't split on comma
  const imageRaw = Array.isArray(e.image) ? e.image[0] : e.image;
  const imageUrl = typeof imageRaw === 'string' ? imageRaw : undefined;

  const slug = (e['@id'] ?? e.url ?? '').replace(/https?:\/\/(?:lu\.ma|luma\.com)\//, '');

  return {
    id: `luma-${slug}`,
    title: e.name,
    description: e.description ?? '',
    startDate: e.startDate,
    endDate: e.endDate,
    location: locationStr,
    address: addr.streetAddress,
    url: e.url ?? e['@id'] ?? `https://lu.ma/${slug}`,
    imageUrl,
    source: 'luma',
    isFree,
    price,
    organizer,
  };
}
