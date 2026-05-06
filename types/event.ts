export type EventSource = 'luma' | 'meetup' | 'eventbrite' | 'facebook' | 'crossweb' | 'other';

export interface WarsawEvent {
  id: string;
  title: string;
  description: string;
  startDate: string; // ISO string
  endDate?: string;
  location: string;
  address?: string;
  url: string;
  imageUrl?: string;
  source: EventSource;
  category?: string;
  isFree?: boolean;
  price?: string;
  organizer?: string;
  attendeeCount?: number;
}
