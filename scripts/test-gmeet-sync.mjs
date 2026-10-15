import { google } from 'googleapis';

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

const oauth2Client = new google.auth.OAuth2(
  clientId,
  clientSecret,
  'https://developers.google.com/oauthplayground'
);
oauth2Client.setCredentials({ refresh_token: refreshToken });

const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

async function run() {
  console.log('Testing Google Calendar Event + Google Meet Link Creation...');
  const res = await calendar.events.insert({
    calendarId: 'primary',
    conferenceDataVersion: 1, // Requests Google Meet generation
    requestBody: {
      summary: '🎵 Test Music Lesson + Google Meet - ProsperWork Music Academy',
      description: 'Verifying automated lesson scheduling and Google Meet room creation.',
      start: { dateTime: new Date(Date.now() + 3600000).toISOString() },
      end: { dateTime: new Date(Date.now() + 7200000).toISOString() },
      conferenceData: {
        createRequest: {
          requestId: `meet_${Date.now()}`,
          conferenceSolutionKey: { type: 'hangoutsMeet' }
        }
      }
    }
  });

  const meetUrl = res.data.conferenceData?.entryPoints?.find(p => p.entryPointType === 'video')?.uri;
  console.log('✅ EVENT CREATED SUCCESSFULLY!');
  console.log('Event ID:', res.data.id);
  console.log('Google Calendar Link:', res.data.htmlLink);
  console.log('Google Meet Link:', meetUrl || 'No meet link generated (check settings)');

  // Clean up
  await calendar.events.delete({ calendarId: 'primary', eventId: res.data.id });
  console.log('🧹 Cleaned up test event.');
}

run().catch(err => {
  console.error('Test error:', err.message);
});

