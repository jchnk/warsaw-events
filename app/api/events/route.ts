import { NextResponse } from 'next/server';
import { fetchLumaEvents } from '@/lib/luma';
import { fetchMeetupEvents } from '@/lib/meetup';
import { fetchEventbriteEvents } from '@/lib/eventbrite';
import { fetchExtraEvents } from '@/lib/extra';

// Give scrapers enough time — ISR means this runs in background after first cache miss
export const maxDuration = 60; // seconds (requires Vercel Pro; on Hobby capped at 10s but ISR helps)
import { fetchCrosswebEvents } from '@/lib/crossweb';
import { WarsawEvent } from '@/types/event';

export const revalidate = 1800;

export async function GET() {
  const [luma, meetup, eventbrite, extra, crossweb] = await Promise.all([
    fetchLumaEvents(),
    fetchMeetupEvents(),
    fetchEventbriteEvents(),
    fetchExtraEvents(),
    fetchCrosswebEvents(),
  ]);

  const seenIds = new Set<string>();
  const seenTitles = new Set<string>();
  // Limit recurring events: max 2 future occurrences per title
  const titleCount = new Map<string, number>();
  const MAX_RECURRING = 2;

  const now = Date.now() - 24 * 60 * 60 * 1000;

  const events: WarsawEvent[] = [...luma, ...meetup, ...eventbrite, ...extra, ...crossweb]
    .sort((a, b) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime())
    .filter((e) => {
      if (new Date(e.startDate).getTime() < now) return false;
      if (seenIds.has(e.id)) return false;
      seenIds.add(e.id);
      // Dedup by title+date (cross-platform duplicates)
      const titleKey = `${e.title.toLowerCase().trim()}|${e.startDate.slice(0, 10)}`;
      if (seenTitles.has(titleKey)) return false;
      seenTitles.add(titleKey);
      // Limit recurring events to MAX_RECURRING occurrences
      const baseTitle = e.title.toLowerCase().trim();
      const count = titleCount.get(baseTitle) ?? 0;
      if (count >= MAX_RECURRING) return false;
      titleCount.set(baseTitle, count + 1);
      return true;
    });

  return NextResponse.json({ events, lastUpdated: new Date().toISOString() });
}
