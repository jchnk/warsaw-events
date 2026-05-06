import { NextResponse } from 'next/server';
import { fetchLumaEvents, fetchETHWarsawEvents } from '@/lib/luma';
import { fetchMeetupEvents } from '@/lib/meetup';
import { fetchEventbriteEvents } from '@/lib/eventbrite';
import { fetchExtraEvents } from '@/lib/extra';
import { fetchCrosswebEvents } from '@/lib/crossweb';
import { WarsawEvent } from '@/types/event';

export const maxDuration = 60;
export const revalidate = 1800;
export const preferredRegion = 'fra1'; // Frankfurt — closest to Warsaw, avoids geo-blocks

export async function GET() {
  const [luma, ethwarsaw, meetup, extra, eventbrite, crossweb] = await Promise.all([
    fetchLumaEvents(),
    fetchETHWarsawEvents(), // calendarApiId endpoint — works from all regions
    fetchMeetupEvents(),
    fetchExtraEvents(),
    fetchEventbriteEvents(),
    fetchCrosswebEvents(),
  ]);

  // Filter online-only Meetup events
  const meetupPhysical = [...meetup, ...extra].filter(
    e => e.source === 'meetup' && e.location !== 'Online event'
  );

  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  const titleCount = new Map<string, number>();
  const MAX_RECURRING = 2;
  const now = Date.now() - 24 * 60 * 60 * 1000;

  const events: WarsawEvent[] = [...ethwarsaw, ...luma, ...meetupPhysical, ...eventbrite, ...crossweb]
    .sort((a, b) => {
      if (a.featured && !b.featured) return -1;
      if (!a.featured && b.featured) return 1;
      return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
    })
    .filter((e) => {
      if (new Date(e.startDate).getTime() < now) return false;
      if (seenIds.has(e.id)) return false;
      seenIds.add(e.id);
      const titleKey = `${e.title.toLowerCase().trim()}|${e.startDate.slice(0, 10)}`;
      if (seenTitles.has(titleKey)) return false;
      seenTitles.add(titleKey);
      const baseTitle = e.title.toLowerCase().trim();
      const count = titleCount.get(baseTitle) ?? 0;
      if (count >= MAX_RECURRING) return false;
      titleCount.set(baseTitle, count + 1);
      return true;
    });

  return NextResponse.json({ events, lastUpdated: new Date().toISOString() });
}
