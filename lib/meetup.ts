import { WarsawEvent } from '@/types/event';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'pl,en;q=0.8',
};

export async function fetchMeetupEvents(): Promise<WarsawEvent[]> {
  try {
    const res = await fetch(
      'https://www.meetup.com/find/?location=pl--Warsaw&source=EVENTS&distance=tenMiles',
      { headers: HEADERS, next: { revalidate: 1800 } }
    );

    if (!res.ok) throw new Error(`Meetup HTTP ${res.status}`);
    const html = await res.text();

    // Meetup injects Apollo Client state into __NEXT_DATA__
    const ndMatch = html.match(/id="__NEXT_DATA__"[^>]*>(\{[\s\S]*?})\s*<\/script>/);
    if (!ndMatch) throw new Error('__NEXT_DATA__ not found');

    const nextData = JSON.parse(ndMatch[1]);
    const apollo: Record<string, any> = nextData?.props?.pageProps?.__APOLLO_STATE__ ?? {};
    const rootQuery: Record<string, any> = apollo['ROOT_QUERY'] ?? {};

    // Find the recommendedEvents field (key contains 'recommendedEvents')
    const recKey = Object.keys(rootQuery).find(k => k.includes('recommendedEvents'));
    if (!recKey) throw new Error('recommendedEvents not found in ROOT_QUERY');

    const edgeRefs: { __ref: string }[] = rootQuery[recKey]?.edges ?? [];

    const events: WarsawEvent[] = [];
    for (const edgeRef of edgeRefs) {
      // Resolve: edgeRef.__ref → Edge object → node.__ref → Event object
      const edge = apollo[edgeRef.__ref] ?? {};
      const nodeRef: string = edge?.node?.__ref ?? '';
      const event = nodeRef ? (apollo[nodeRef] ?? {}) : {};

      if (!event.title) continue;

      // Resolve venue
      const venueRef: string = typeof event.venue === 'object' ? (event.venue?.__ref ?? '') : '';
      const venue = venueRef ? (apollo[venueRef] ?? {}) : {};

      // Resolve group
      const groupRef: string = typeof event.group === 'object' ? (event.group?.__ref ?? '') : '';
      const group = groupRef ? (apollo[groupRef] ?? {}) : {};

      // Resolve photo
      const photoRef: string = typeof event.featuredEventPhoto === 'object' ? (event.featuredEventPhoto?.__ref ?? '') : '';
      const photo = photoRef ? (apollo[photoRef] ?? {}) : {};

      const mapped = mapEvent(event, venue, group, photo);
      if (mapped) events.push(mapped);
    }

    console.log(`[Meetup scraper] Found ${events.length} events`);
    return events;
  } catch (err) {
    console.error('[Meetup scraper]', err);
    return [];
  }
}

function mapEvent(e: any, venue: any, group: any, photo: any = {}): WarsawEvent | null {
  if (!e.title || !e.dateTime) return null;

  const locationStr = [venue.name, venue.city].filter(Boolean).join(', ') || 'Warszawa';
  const address = [venue.address, venue.city].filter(Boolean).join(', ') || undefined;
  const id = String(e.id ?? Math.random());
  const imageUrl = photo.highResUrl ?? e.imageUrl ?? undefined;

  return {
    id: `meetup-${id}`,
    title: e.title,
    description: e.description ?? '',
    startDate: e.dateTime,
    endDate: e.endTime ?? undefined,
    location: locationStr,
    address,
    url: e.eventUrl ?? `https://www.meetup.com/events/${id}/`,
    imageUrl,
    source: 'meetup',
    isFree: e.isFree ?? true,
    organizer: group.name ?? undefined,
    attendeeCount: e.going ?? undefined,
  };
}
