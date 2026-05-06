import { WarsawEvent } from '@/types/event';
import { SourceBadge } from './SourceBadge';
import { format, isValid } from 'date-fns';
import { pl } from 'date-fns/locale';
import { MapPin, Users, ExternalLink, Calendar } from 'lucide-react';

export function EventCard({ event }: { event: WarsawEvent }) {
  const start = new Date(event.startDate);
  const dateStr = isValid(start) ? format(start, 'd MMM yyyy', { locale: pl }) : event.startDate.slice(0, 10);
  const timeStr = isValid(start) ? format(start, 'HH:mm') : '';

  return (
    <a
      href={event.url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 overflow-hidden"
    >
      {/* Image */}
      <div className="relative h-44 bg-gradient-to-br from-indigo-50 to-violet-100 overflow-hidden">
        {event.imageUrl ? (
          <img
            src={event.imageUrl}
            alt={event.title}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
            onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-5xl select-none">
            🏙️
          </div>
        )}
        <div className="absolute top-3 left-3 flex gap-1.5">
          <SourceBadge source={event.source} />
          {event.category && (
            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-white/90 text-gray-700 border border-white/50 backdrop-blur-sm">
              {event.category}
            </span>
          )}
        </div>
        <div className="absolute top-3 right-3">
          {event.isFree ? (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-500 text-white">
              Darmowe
            </span>
          ) : event.price ? (
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-white/90 text-gray-800 border">
              {event.price}
            </span>
          ) : null}
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-col flex-1 p-4 gap-2">
        <h3 className="font-semibold text-gray-900 text-sm leading-snug line-clamp-2 group-hover:text-indigo-600 transition-colors">
          {event.title}
        </h3>

        <div className="flex flex-col gap-1 text-xs text-gray-500 mt-auto">
          <div className="flex items-center gap-1.5">
            <Calendar className="w-3.5 h-3.5 shrink-0 text-indigo-400" />
            <span className="font-medium text-gray-700">{dateStr}</span>
            <span className="text-gray-400">·</span>
            <span>{timeStr}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <MapPin className="w-3.5 h-3.5 shrink-0 text-rose-400" />
            <span className="truncate">{event.location}</span>
          </div>

          {event.organizer && (
            <div className="flex items-center gap-1.5">
              <span className="text-gray-400">by</span>
              <span className="truncate text-gray-600">{event.organizer}</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-50">
          {event.attendeeCount ? (
            <div className="flex items-center gap-1 text-xs text-gray-400">
              <Users className="w-3.5 h-3.5" />
              <span>{event.attendeeCount.toLocaleString('pl')} osób</span>
            </div>
          ) : <div />}
          <div className="flex items-center gap-1 text-xs text-indigo-500 font-medium">
            <span>Sprawdź</span>
            <ExternalLink className="w-3 h-3" />
          </div>
        </div>
      </div>
    </a>
  );
}
