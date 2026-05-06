import { WarsawEvent } from '@/types/event';

// ── ETHWarsaw events to feature ───────────────────────────────────────────────
// Add new ETHWarsaw event slugs here (from lu.ma/<slug> or luma.com/<slug>)
const ETHWARSAW_SLUGS = [
  'ZircuitETHWarsaw',
];

// ── Warsaw general events (HTML fallback — works from any IP) ─────────────────

export async function fetchLumaEvents(): Promise<WarsawEvent[]> {
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

    const events = (data.itemListElement ?? [])
      .map((item: any) => mapLumaJsonLd(item))
      .filter((e: WarsawEvent | null): e is WarsawEvent =>
        e !== null && new Date(e.startDate).getTime() >= now
      );

    console.log(`[Luma] ${events.length} Warsaw events`);
    return events;
  } catch (err) {
    console.error('[Luma]', err);
    return [];
  }
}

// ── ETHWarsaw featured events (fetched by slug — reliable from any IP) ────────

export async function fetchETHWarsawEvents(): Promise<WarsawEvent[]> {
  const results = await Promise.allSettled(
    ETHWARSAW_SLUGS.map(fetchLumaEventBySlug)
  );
  const events = results
    .filter((r): r is PromiseFulfilledResult<WarsawEvent | null> => r.status === 'fulfilled')
    .map(r => r.value)
    .filter((e): e is WarsawEvent => e !== null);

  console.log(`[ETHWarsaw] ${events.length} featured events`);
  return events;
}

async function fetchLumaEventBySlug(slug: string): Promise<WarsawEvent | null> {
  try {
    const res = await fetch(`https://lu.ma/${slug}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
      },
      next: { revalidate: 1800 },
    });
    if (!res.ok) return null;

    const html = await res.text();
    const match = html.match(
      /type="application\/ld\+json"[^>]*>\s*(\{[\s\S]*?"@type"\s*:\s*"Event"[\s\S]*?)\s*<\/script>/
    );
    if (!match) return null;

    const e = JSON.parse(match[1]);
    const now = Date.now() - 24 * 60 * 60 * 1000;
    if (!e?.startDate || new Date(e.startDate).getTime() < now) return null;

    return mapLumaJsonLd({ item: e }, true /* featured */);
  } catch {
    return null;
  }
}

// ── JSON-LD event mapper ──────────────────────────────────────────────────────

function mapLumaJsonLd(item: any, featured = false): WarsawEvent | null {
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
    price: !isFree && offer.price ? `${offer.price} ${(offer.priceCurrency ?? 'PLN').toUpperCase()}` : undefined,
    organizer: Array.isArray(e.organizer) ? e.organizer[0]?.name : e.organizer?.name,
    featured,
  };
}
