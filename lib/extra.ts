import { WarsawEvent } from '@/types/event';

// Active Warsaw Meetup groups to scrape individually
// (adds events not shown in the main find page)
const WARSAW_MEETUP_GROUPS = [
  { slug: 'allegrotech',                    name: 'Allegro Tech' },
  { slug: 'SysOps-DevOps-Polska-Warszawa',  name: 'SysOps/DevOps Warszawa' },
  { slug: 'mindstone-warsaw-ai-community',  name: 'Mindstone Warsaw AI' },
  { slug: 'scrumvival',                     name: 'Scrumvival' },
  { slug: 'GDG-Warszawa',                   name: 'GDG Warszawa' },
  { slug: 'Warsaw-JavaScript',              name: 'Warsaw JavaScript' },
  { slug: 'python-warsaw',                  name: 'Python Warsaw' },
  { slug: 'Warsaw-Startup-Hub',             name: 'Warsaw Startup Hub' },
  { slug: 'legaltech-polska-meetup',        name: 'LegalTech Polska' },
  { slug: 'cloud-data-meetup-poland',       name: 'Cloud & Data Meetup PL' },
  { slug: 'microsoft-azure-user-group-poland', name: 'Azure User Group PL' },
  { slug: 'Apple-Community-PL',             name: 'Apple Community PL' },
  { slug: 'start-warsaw',                   name: 'START Warsaw' },
  { slug: 'Warsaw-Makers-and-Founders',     name: 'Warsaw Makers & Founders' },
];

// Additional Luma community calendars in Warsaw
const WARSAW_LUMA_CALENDARS = [
  'kolektyw3',
  'warsawmakers',
  'gdg-warszawa',
];

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml',
  'Accept-Language': 'pl,en;q=0.8',
};

export async function fetchExtraEvents(): Promise<WarsawEvent[]> {
  const [meetupResults, lumaResults] = await Promise.all([
    Promise.allSettled(WARSAW_MEETUP_GROUPS.map(g => fetchMeetupGroup(g.slug, g.name))),
    Promise.allSettled(WARSAW_LUMA_CALENDARS.map(fetchLumaCalendar)),
  ]);

  const events: WarsawEvent[] = [];
  for (const r of [...meetupResults, ...lumaResults]) {
    if (r.status === 'fulfilled') events.push(...r.value);
  }
  return events;
}

// ── Meetup group scraper ─────────────────────────────────────────────────────

async function fetchMeetupGroup(slug: string, groupName: string): Promise<WarsawEvent[]> {
  try {
    const res = await fetch(`https://www.meetup.com/${slug}/events/`, {
      headers: HEADERS,
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const html = await res.text();
    return parseMeetupGroupPage(html, slug, groupName);
  } catch {
    return [];
  }
}

function parseMeetupGroupPage(html: string, slug: string, groupName: string): WarsawEvent[] {
  const ndMatch = html.match(/id="__NEXT_DATA__"[^>]*>(\{[\s\S]*?})\s*<\/script>/);
  if (!ndMatch) return [];

  try {
    const nextData = JSON.parse(ndMatch[1]);
    const apollo: Record<string, any> = nextData?.props?.pageProps?.__APOLLO_STATE__ ?? {};
    const now = new Date().toISOString();

    // Simply collect all Event objects with future dates from Apollo cache
    const events: WarsawEvent[] = [];
    for (const [key, obj] of Object.entries(apollo)) {
      if (!key.startsWith('Event:')) continue;
      if (!obj?.title || !obj?.dateTime) continue;
      if (obj.dateTime < now) continue;

      // Resolve venue
      const venueRef: string = typeof obj.venue === 'object' ? (obj.venue?.__ref ?? '') : '';
      const venue = venueRef ? (apollo[venueRef] ?? {}) : {};

      // Resolve photo
      const photoRef: string = typeof obj.featuredEventPhoto === 'object' ? (obj.featuredEventPhoto?.__ref ?? '') : '';
      const photo = photoRef ? (apollo[photoRef] ?? {}) : {};

      const locationStr = [venue.name, venue.city].filter(Boolean).join(', ') || 'Warszawa';
      const id = key.replace('Event:', '');

      events.push({
        id: `meetup-${slug}-${id}`,
        title: obj.title,
        description: obj.description ?? '',
        startDate: obj.dateTime,
        endDate: obj.endTime ?? undefined,
        location: locationStr,
        address: [venue.address, venue.city].filter(Boolean).join(', ') || undefined,
        url: obj.eventUrl ?? `https://www.meetup.com/${slug}/events/${id}/`,
        imageUrl: photo.highResUrl ?? obj.imageUrl ?? undefined,
        source: 'meetup',
        isFree: obj.isFree ?? true,
        organizer: groupName,
        attendeeCount: obj.going ?? undefined,
      });
    }
    return events;
  } catch {
    return [];
  }
}

// ── Luma calendar scraper ────────────────────────────────────────────────────

async function fetchLumaCalendar(calendarSlug: string): Promise<WarsawEvent[]> {
  try {
    const res = await fetch(`https://lu.ma/${calendarSlug}`, {
      headers: HEADERS,
      next: { revalidate: 1800 },
    });
    if (!res.ok) return [];
    const html = await res.text();

    const match = html.match(
      /type="application\/ld\+json"[^>]*>\s*(\{[\s\S]*?"@type"\s*:\s*"ItemList"[\s\S]*?)\s*<\/script>/
    );
    if (!match) return [];

    const data = JSON.parse(match[1]);
    const items: any[] = data.itemListElement ?? [];

    return items.map(item => mapLumaItem(item, calendarSlug)).filter(Boolean) as WarsawEvent[];
  } catch {
    return [];
  }
}

function mapLumaItem(item: any, calendarSlug: string): WarsawEvent | null {
  const e = item.item ?? item;
  if (!e?.name || !e?.startDate) return null;
  if (new Date(e.startDate) < new Date()) return null;

  const loc = e.location ?? {};
  const addr = loc.address ?? {};
  const locationStr = loc.name ?? [addr.streetAddress, addr.addressLocality].filter(Boolean).join(', ') ?? 'Warszawa';

  const offer = e.offers?.[0] ?? {};
  const isFree = !offer.price || offer.price === 0;
  const price = !isFree ? `${offer.price} ${(offer.priceCurrency ?? 'PLN').toUpperCase()}` : undefined;
  const organizer = Array.isArray(e.organizer) ? e.organizer[0]?.name : e.organizer?.name;
  // image is an array of CDN URLs — do NOT split on comma (CDN params contain commas)
  const imageRaw = Array.isArray(e.image) ? e.image[0] : e.image;
  const imageUrl = typeof imageRaw === 'string' ? imageRaw : undefined;
  const slug = (e['@id'] ?? e.url ?? '').replace(/https?:\/\/(?:lu\.ma|luma\.com)\//, '');

  return {
    id: `luma-${calendarSlug}-${slug}`,
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
