import { google } from 'googleapis';

function getGoogleAuthClient() {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  // 1. Prefer OAuth2 (Official Account: prosperworkmusicconcepts@gmail.com)
  if (clientId && clientSecret && refreshToken) {
    const oauth2Client = new google.auth.OAuth2(
      clientId,
      clientSecret,
      'https://developers.google.com/oauthplayground'
    );
    oauth2Client.setCredentials({ refresh_token: refreshToken });
    return oauth2Client;
  }

  // 2. Fallback to Service Account if present
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  let key = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '';
  if (email && key) {
    if (key.startsWith('"') && key.endsWith('"')) {
      try { key = JSON.parse(key); } catch {}
    }
    return new google.auth.JWT({
      email,
      key,
      scopes: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/drive'
      ]
    });
  }

  return null;
}

export function getGoogleCalendarClient() {
  const auth = getGoogleAuthClient();
  const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
  if (!auth) return null;
  const calendar = google.calendar({ version: 'v3', auth });
  return { calendar, calendarId };
}

export function getGoogleDriveClient() {
  const auth = getGoogleAuthClient();
  const folderId = process.env.GOOGLE_DRIVE_BACKUP_FOLDER_ID;
  if (!auth) return null;
  const drive = google.drive({ version: 'v3', auth });
  return { drive, folderId };
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
      console.warn('[GoogleCalendar] Skipping event sync: Google credentials not configured.');
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
