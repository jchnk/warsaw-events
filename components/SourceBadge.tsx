import { EventSource } from '@/types/event';

const CONFIG: Record<EventSource, { label: string; className: string }> = {
  luma:       { label: 'Luma',        className: 'bg-violet-100 text-violet-700 border-violet-200' },
  meetup:     { label: 'Meetup',      className: 'bg-red-100 text-red-700 border-red-200' },
  eventbrite: { label: 'Eventbrite',  className: 'bg-orange-100 text-orange-700 border-orange-200' },
  facebook:   { label: 'Facebook',    className: 'bg-blue-100 text-blue-700 border-blue-200' },
  crossweb:   { label: 'Crossweb',    className: 'bg-teal-100 text-teal-700 border-teal-200' },
  other:      { label: 'Inne',        className: 'bg-gray-100 text-gray-600 border-gray-200' },
};

export function SourceBadge({ source }: { source: EventSource }) {
  const { label, className } = CONFIG[source] ?? CONFIG.other;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}>
      {label}
    </span>
  );
}
