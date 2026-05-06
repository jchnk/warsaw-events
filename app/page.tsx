import { WarsawEvent } from '@/types/event';
import { FilterBar } from '@/components/FilterBar';
import { format } from 'date-fns';
import { pl } from 'date-fns/locale';
import { MapPin, RefreshCw } from 'lucide-react';

export const preferredRegion = 'fra1'; // Frankfurt — closest to Warsaw, avoids geo-blocking
export const dynamic = 'force-dynamic';  // Skip static build; render from Frankfurt on first request
// Individual fetch() calls in scrapers use { next: { revalidate: 1800 } } for data caching

async function getEvents(): Promise<{ events: WarsawEvent[]; lastUpdated: string }> {
  const { fetchLumaEvents, fetchETHWarsawEvents } = await import('@/lib/luma');
  const { fetchMeetupEvents } = await import('@/lib/meetup');
  const { fetchEventbriteEvents } = await import('@/lib/eventbrite');
  const { fetchExtraEvents } = await import('@/lib/extra');
  const { fetchCrosswebEvents } = await import('@/lib/crossweb');

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

  const events = [...ethwarsaw, ...luma, ...meetupPhysical, ...eventbrite, ...crossweb]
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

  return { events, lastUpdated: new Date().toISOString() };
}

export default async function Home() {
  const { events, lastUpdated } = await getEvents();

  const sourceCounts = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.source] = (acc[e.source] ?? 0) + 1;
    return acc;
  }, {});

  const updatedStr = format(new Date(lastUpdated), "d MMM, HH:mm", { locale: pl });

  return (
    <main className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero */}
      <div className="bg-gradient-to-br from-indigo-900 via-indigo-800 to-violet-900 text-white">
        <div className="max-w-6xl mx-auto px-4 py-14 sm:py-20">
          <div className="flex items-center gap-2 text-indigo-300 text-sm font-medium mb-4">
            <MapPin className="w-4 h-4" />
            Warszawa, Polska
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-3">
            Eventy w Warszawie
          </h1>
          <p className="text-indigo-200 text-lg max-w-xl">
            Jedna strona, wszystkie tech events — Luma, Meetup, Eventbrite i nie tylko.
          </p>

          {/* Stats */}
          <div className="flex flex-wrap gap-3 mt-8">
            <StatBadge label="Wszystkich" value={events.length} />
            <StatBadge label="Luma" value={sourceCounts.luma ?? 0} color="bg-violet-500" />
            <StatBadge label="Meetup" value={sourceCounts.meetup ?? 0} color="bg-red-500" />
            {(sourceCounts.crossweb ?? 0) > 0 && (
              <StatBadge label="Crossweb" value={sourceCounts.crossweb ?? 0} color="bg-teal-500" />
            )}
            {(sourceCounts.eventbrite ?? 0) > 0 && (
              <StatBadge label="Eventbrite" value={sourceCounts.eventbrite ?? 0} color="bg-orange-500" />
            )}
            {(sourceCounts.other ?? 0) > 0 && (
              <StatBadge label="Inne" value={sourceCounts.other ?? 0} color="bg-gray-400" />
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-gray-800">Nadchodzące eventy</h2>
          <div className="flex items-center gap-1.5 text-xs text-gray-400">
            <RefreshCw className="w-3.5 h-3.5" />
            Aktualizacja: {updatedStr}
          </div>
        </div>
        <FilterBar events={events} />
      </div>

      {/* Footer */}
      <footer className="border-t border-gray-100 mt-16 py-8">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-gray-400">
          Agregator eventów warszawskich — dane z Luma, Meetup, Eventbrite i innych źródeł.
          Odświeżane automatycznie co 30 minut.
        </div>
      </footer>
    </main>
  );
}

function StatBadge({ label, value, color }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-xl px-4 py-2 text-sm">
      {color && <span className={`w-2.5 h-2.5 rounded-full ${color}`} />}
      <span className="text-2xl font-bold">{value}</span>
      <span className="text-indigo-200">{label}</span>
    </div>
  );
}
