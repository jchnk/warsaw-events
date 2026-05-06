import { WarsawEvent } from '@/types/event';

// Eventbrite wymaga API tokena - brak SSR/publicznych danych w HTML
// Ten fetcher jest placeholderem; ustaw EVENTBRITE_TOKEN w .env.local aby go aktywować
export async function fetchEventbriteEvents(): Promise<WarsawEvent[]> {
  const token = process.env.EVENTBRITE_TOKEN;
  if (!token) return [];

  try {
    const params = new URLSearchParams({
      'location.address': 'Warsaw, Poland',
      'location.within': '25km',
      expand: 'organizer,venue,ticket_classes',
      sort_by: 'date',
      page_size: '40',
    });

    const res = await fetch(
      `https://www.eventbriteapi.com/v3/events/search/?${params}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        next: { revalidate: 1800 },
      }
    );

    if (!res.ok) throw new Error(`Eventbrite ${res.status}`);
    const data = await res.json();
    return (data.events ?? []).map(mapEventbriteEvent).filter(Boolean) as WarsawEvent[];
  } catch (err) {
    console.error('[Eventbrite scraper]', err);
    return [];
  }
}

function mapEventbriteEvent(e: any): WarsawEvent | null {
  if (!e?.name?.text) return null;
  const venue = e.venue ?? {};
  const ticket = e.ticket_classes?.[0];
  const isFree = e.is_free || ticket?.free;

  return {
    id: `eventbrite-${e.id}`,
    title: e.name.text,
    description: e.description?.text ?? e.summary ?? '',
    startDate: e.start?.utc ?? e.start?.local,
    endDate: e.end?.utc ?? e.end?.local,
    location: venue.name ?? venue.address?.city ?? 'Warszawa',
    address: venue.address?.localized_address_display,
    url: e.url,
    imageUrl: e.logo?.url,
    source: 'eventbrite',
    category: e.category?.name,
    isFree,
    price: !isFree ? (ticket?.cost?.display ?? undefined) : undefined,
    organizer: e.organizer?.name,
    attendeeCount: e.capacity,
  };
}
