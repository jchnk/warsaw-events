'use client';

import { WarsawEvent, EventSource } from '@/types/event';
import { useMemo, useState, useTransition } from 'react';
import { Search, SlidersHorizontal } from 'lucide-react';
import { EventCard } from './EventCard';
import { ErrorBoundary } from './ErrorBoundary';

const SOURCE_LABELS: Record<EventSource, string> = {
  luma:       'Luma',
  meetup:     'Meetup',
  eventbrite: 'Eventbrite',
  facebook:   'Facebook',
  crossweb:   'Crossweb',
  other:      'Inne',
};

const SOURCE_COLORS: Record<EventSource, string> = {
  luma:       'bg-violet-500',
  meetup:     'bg-red-500',
  eventbrite: 'bg-orange-500',
  facebook:   'bg-blue-500',
  crossweb:   'bg-teal-500',
  other:      'bg-gray-400',
};

export function FilterBar({ events }: { events: WarsawEvent[] }) {
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<EventSource | 'all'>('all');
  const [category, setCategory] = useState('all');
  const [freeOnly, setFreeOnly] = useState(false);
  const [, startTransition] = useTransition();

  const sources = useMemo(() => {
    const counts: Record<string, number> = {};
    events.forEach((e) => { counts[e.source] = (counts[e.source] ?? 0) + 1; });
    return Object.entries(counts) as [EventSource, number][];
  }, [events]);

  const categories = useMemo(() => {
    const cats = new Set(events.map((e) => e.category).filter(Boolean));
    return Array.from(cats) as string[];
  }, [events]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return events.filter((e) => {
      if (source !== 'all' && e.source !== source) return false;
      if (category !== 'all' && e.category !== category) return false;
      if (freeOnly && !e.isFree) return false;
      if (q && !e.title.toLowerCase().includes(q) && !e.location.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, source, category, freeOnly, query]);

  return (
    <div className="space-y-6">
      {/* Search + Free filter */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Szukaj eventu lub miejsca..."
            value={query}
            onChange={(e) => startTransition(() => setQuery(e.target.value))}
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 shadow-sm"
          />
        </div>
        <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-gray-200 bg-white shadow-sm cursor-pointer select-none text-sm text-gray-700 hover:bg-gray-50 transition">
          <input
            type="checkbox"
            checked={freeOnly}
            onChange={(e) => setFreeOnly(e.target.checked)}
            className="rounded text-emerald-500 focus:ring-emerald-300"
          />
          Tylko darmowe
        </label>
      </div>

      {/* Source pills */}
      <div className="flex flex-wrap gap-2 items-center">
        <SlidersHorizontal className="w-4 h-4 text-gray-400 shrink-0" />
        <button
          onClick={() => setSource('all')}
          className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
            source === 'all'
              ? 'bg-indigo-600 text-white shadow'
              : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          Wszystkie ({events.length})
        </button>
        {sources.map(([src, count]) => (
          <button
            key={src}
            onClick={() => setSource(src === source ? 'all' : src)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition ${
              source === src
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${SOURCE_COLORS[src]}`} />
            {SOURCE_LABELS[src]} ({count})
          </button>
        ))}
      </div>

      {/* Category pills */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setCategory('all')}
            className={`px-3 py-1 rounded-full text-xs transition ${
              category === 'all'
                ? 'bg-gray-800 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            Wszystkie kategorie
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat === category ? 'all' : cat)}
              className={`px-3 py-1 rounded-full text-xs transition ${
                category === cat
                  ? 'bg-gray-800 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <div className="text-4xl mb-3">🔍</div>
          <p className="text-sm">Brak eventów pasujących do filtrów.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((event) => (
            <ErrorBoundary key={event.id}>
              <EventCard event={event} />
            </ErrorBoundary>
          ))}
        </div>
      )}
    </div>
  );
}
