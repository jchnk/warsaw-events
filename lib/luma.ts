import { WarsawEvent } from '@/types/event';

const WARSAW_PLACE_ID = 'discplace-PTcuEQVHuySJe8N';
const ETHWARSAW_CAL_ID = 'cal-3hRtC8aF6Ea2F9N';
const API_BASE = 'https://api.lu.ma/discover/get-paginated-events';
const MAX_PAGES = 4;

// Cities that are definitely NOT Warsaw (Luma sometimes includes suburbs)
const WARSAW_CITIES = new Set(['warsaw', 'warszawa', '']);

function isWarsawCity(city: string): boolean {
  return WARSAW_CITIES.has(city.toLowerCase().trim());
}

// ── Warsaw city events ────────────────────────────────────────────────────────

export async function fetchLumaEvents(): Promise<WarsawEvent[]> {
  try {
    const entries = await fetchPages({ placeApiId: WARSAW_PLACE_ID });
    if (entries.length === 0) return fetchLumaHtmlFallback();

    const now = Date.now() - 24 * 60 * 60 * 1000;

    // Map entries keeping score/featured metadata for sorting
    const mapped = entries
      .map((entry, idx) => ({ event: mapLumaEntry(entry), score: entry.score ?? 0, idx }))
      .filter((x): x is { event: WarsawEvent; score: number; idx: number } => x.event !== null)
      .filter(x => new Date(x.event.startDate).getTime() >= now);

    // Sort: by date ascending (API already pre-sorts by relevance; we respect date order for UX)
    mapped.sort((a, b) =>
      new Date(a.event.startDate).getTime() - new Date(b.event.startDate).getTime()
    );

    console.log(`[Luma API] ${mapped.length} Warsaw events`);
    return mapped.map(x => x.event);
  } catch (err) {
    console.error('[Luma API]', err);
    return fetchLumaHtmlFallback();
  }
}

// ── ETHWarsaw featured calendar ───────────────────────────────────────────────

export async function fetchETHWarsawEvents(): Promise<WarsawEvent[]> {
  try {
    const entries = await fetchPages({ calendarApiId: ETHWARSAW_CAL_ID });
    const now = Date.now() - 24 * 60 * 60 * 1000;

    return entries
      .map(entry => mapLumaEntry(entry, true /* featured */))
      .filter((e): e is WarsawEvent => e !== null)
      .filter(e => new Date(e.startDate).getTime() >= now);
  } catch (err) {
    console.error('[ETHWarsaw API]', err);
    return [];
  }
}

// ── Shared paginator ──────────────────────────────────────────────────────────

async function fetchPages(params: Record<string, string>): Promise<any[]> {
  const all: any[] = [];
  let cursor: string | null = null;

  for (let page = 0; page < MAX_PAGES; page++) {
    const p = new URLSearchParams({ ...params, pagination_limit: '50' });
    if (cursor) p.set('pagination_cursor', cursor);

    const res = await fetch(`${API_BASE}?${p}`, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
      next: { revalidate: 1800 },
    });

    if (!res.ok) throw new Error(`Luma API ${res.status}`);
    const data = await res.json();
    all.push(...(data.entries ?? []));
    if (!data.has_more || !data.next_cursor) break;
    cursor = data.next_cursor;
  }

  return all;
}

// ── Entry mapper ──────────────────────────────────────────────────────────────

const ETHWARSAW_CAL_IDS = new Set([
  'cal-3hRtC8aF6Ea2F9N',  // ETHWarsaw Event Calendar
]);

function mapLumaEntry(entry: any, forceFeatured = false): WarsawEvent | null {
  const event = entry?.event;
  if (!event?.name || !event?.start_at) return null;

  const geo = event.geo_address_info ?? {};
  const pl = geo.localized?.pl ?? {};

  // Filter out events not in Warsaw
  const city = geo.city ?? pl.city ?? '';
  if (city && !isWarsawCity(city)) return null;

  const locationStr = pl.address || geo.address || geo.city_state || 'Warszawa';
  const fullAddress = pl.full_address || geo.full_address;

  const ticket = entry.ticket_info ?? {};
  const isFree = ticket.is_free ?? true;
  const priceCents = ticket.price?.cents;
  const priceCurrency = (ticket.price?.currency ?? 'PLN').toUpperCase();
  const price = !isFree && priceCents != null
    ? `${(priceCents / 100).toFixed(0)} ${priceCurrency}`
    : undefined;

  const cal = entry.calendar ?? {};
  const calName = cal.name && cal.name !== 'Personal' ? cal.name : undefined;
  const isETHWarsaw = ETHWARSAW_CAL_IDS.has(event.calendar_api_id ?? '') ||
    ETHWARSAW_CAL_IDS.has(cal.api_id ?? '');
  const slug = event.url ?? event.api_id;

  return {
    id: `luma-${event.api_id}`,
    title: event.name,
    description: '',
    startDate: new Date(event.start_at).toISOString(),
    endDate: event.end_at ? new Date(event.end_at).toISOString() : undefined,
    location: locationStr,
    address: fullAddress,
    city: city || 'Warszawa',
    url: `https://lu.ma/${slug}`,
    imageUrl: event.cover_url ?? undefined,
    source: 'luma',
    isFree,
    price,
    organizer: calName,
    attendeeCount: entry.guest_count ?? undefined,
    featured: forceFeatured || isETHWarsaw,
  };
}

// ── HTML fallback ─────────────────────────────────────────────────────────────

async function fetchLumaHtmlFallback(): Promise<WarsawEvent[]> {
  try {
    const res = await fetch('https://lu.ma/warsaw', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pl,en;q=0.8',
      },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const html = await res.text();
    const match = html.match(
      /type="application\/ld\+json"[^>]*>\s*(\{[\s\S]*?"@type"\s*:\s*"ItemList"[\s\S]*?)\s*<\/script>/
    );
    if (!match) return [];
    const data = JSON.parse(match[1]);
    const now = Date.now() - 24 * 60 * 60 * 1000;
    return (data.itemListElement ?? [])
      .map(mapLumaJsonLd)
      .filter((e: WarsawEvent | null): e is WarsawEvent =>
        e !== null && new Date(e.startDate).getTime() >= now
      );
  } catch {
    return [];
  }
}

function mapLumaJsonLd(item: any): WarsawEvent | null {
  const e = item.item ?? item;
  if (!e?.name || !e?.startDate) return null;
  const loc = e.location ?? {};
  const addr = loc.address ?? {};
  const locationStr = loc.name ?? [addr.streetAddress, addr.addressLocality].filter(Boolean).join(', ') ?? 'Warszawa';
  const offer = e.offers?.[0] ?? {};
  const isFree = !offer.price || offer.price === 0;
  const imageRaw = Array.isArray(e.image) ? e.image[0] : e.image;
  const slug = (e['@id'] ?? e.url ?? '').replace(/https?:\/\/(?:lu\.ma|luma\.com)\//, '');
  return {
    id: `luma-${slug}`,
    title: e.name,
    description: e.description ?? '',
    startDate: e.startDate,
    endDate: e.endDate,
    location: locationStr,
    city: addr.addressLocality ?? 'Warszawa',
    url: e.url ?? e['@id'] ?? `https://lu.ma/${slug}`,
    imageUrl: typeof imageRaw === 'string' ? imageRaw : undefined,
    source: 'luma',
    isFree,
    price: !isFree ? `${offer.price} ${(offer.priceCurrency ?? 'PLN').toUpperCase()}` : undefined,
    organizer: Array.isArray(e.organizer) ? e.organizer[0]?.name : e.organizer?.name,
  };
}
