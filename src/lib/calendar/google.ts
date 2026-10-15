import { google } from 'googleapis';

function getGoogleCalendarClient() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  const calendarId = process.env.GOOGLE_CALENDAR_ID;

  if (!email || !key || !calendarId) {
    return null;
  }

  if (key.startsWith('"') && key.endsWith('"')) {
    try {
      key = JSON.parse(key);
    } catch {
      // ignore
    }
  }

  const auth = new google.auth.JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/calendar']
  });

  const calendar = google.calendar({ version: 'v3', auth });
  return { calendar, calendarId };
}

export interface CalendarEventPayload {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  attendeeEmails?: string[];
  location?: string;
}

/**
 * Creates or syncs an event into ProsperWork's Google Calendar.
 * Returns the created event ID and link or null if not configured.
 */
export async function createGoogleCalendarEvent(payload: CalendarEventPayload) {
  try {
    const client = getGoogleCalendarClient();
    if (!client) {
      console.warn('[GoogleCalendar] Skipping event sync: Google Calendar credentials not fully configured.');
      return null;
    }

    const { calendar, calendarId } = client;

    const res = await calendar.events.insert({
      calendarId,
      requestBody: {
        summary: payload.summary,
        description: payload.description,
        location: payload.location || 'ProsperWork Online Virtual Studio',
        start: { dateTime: payload.startIso },
        end: { dateTime: payload.endIso },
        attendees: payload.attendeeEmails?.map(email => ({ email })),
      }
    });

    return {
      eventId: res.data.id,
      htmlLink: res.data.htmlLink
    };
  } catch (error: any) {
    console.error('[GoogleCalendar] Error creating event:', error?.message || error);
    return null;
  }
}

/**
 * Updates an existing calendar event.
 */
export async function updateGoogleCalendarEvent(eventId: string, payload: Partial<CalendarEventPayload>) {
  try {
    const client = getGoogleCalendarClient();
    if (!client) return null;

    const { calendar, calendarId } = client;

    const requestBody: any = {};
    if (payload.summary) requestBody.summary = payload.summary;
    if (payload.description) requestBody.description = payload.description;
    if (payload.startIso) requestBody.start = { dateTime: payload.startIso };
    if (payload.endIso) requestBody.end = { dateTime: payload.endIso };
    if (payload.attendeeEmails) {
      requestBody.attendees = payload.attendeeEmails.map(email => ({ email }));
    }

    const res = await calendar.events.patch({
      calendarId,
      eventId,
      requestBody
    });

    return {
      eventId: res.data.id,
      htmlLink: res.data.htmlLink
    };
  } catch (error: any) {
    console.error('[GoogleCalendar] Error updating event:', error?.message || error);
    return null;
  }
}

/**
 * Deletes an event from Google Calendar.
 */
export async function deleteGoogleCalendarEvent(eventId: string) {
  try {
    const client = getGoogleCalendarClient();
    if (!client) return false;

    const { calendar, calendarId } = client;

    await calendar.events.delete({
      calendarId,
      eventId
    });
    return true;
  } catch (error: any) {
    console.error('[GoogleCalendar] Error deleting event:', error?.message || error);
    return false;
  }
}
