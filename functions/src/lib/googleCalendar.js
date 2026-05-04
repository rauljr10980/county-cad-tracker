const { google } = require('googleapis');

// Read env vars fresh each call so Railway var changes take effect without redeploy
function getCalendar() {
  const calendarId   = process.env.GOOGLE_CALENDAR_ID;
  const clientEmail  = process.env.GOOGLE_CLIENT_EMAIL;
  // Railway may store newlines as literal \n — normalise either way
  const privateKey   = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!clientEmail || !privateKey || !calendarId) {
    const missing = [
      !clientEmail  && 'GOOGLE_CLIENT_EMAIL',
      !privateKey   && 'GOOGLE_PRIVATE_KEY',
      !calendarId   && 'GOOGLE_CALENDAR_ID',
    ].filter(Boolean).join(', ');
    throw new Error(`Missing Google Calendar env vars: ${missing}`);
  }

  const auth = new google.auth.JWT(
    clientEmail,
    null,
    privateKey,
    ['https://www.googleapis.com/auth/calendar']
  );

  return { calendar: google.calendar({ version: 'v3', auth }), calendarId };
}

/**
 * Create a Google Calendar event.
 * @param {object} opts
 * @param {string} opts.title
 * @param {string} [opts.description]
 * @param {Date|string} opts.start  - ISO string or Date
 * @param {Date|string} [opts.end]  - defaults to start + 1 hour
 * @param {string} [opts.location]
 */
async function createCalendarEvent({ title, description, start, end, location }) {
  try {
    const { calendar, calendarId } = getCalendar();

    const startDate = new Date(start);
    const endDate   = end ? new Date(end) : new Date(startDate.getTime() + 60 * 60 * 1000);

    const event = {
      summary: title,
      description: description || '',
      location: location || '',
      start: { dateTime: startDate.toISOString(), timeZone: 'America/Chicago' },
      end:   { dateTime: endDate.toISOString(),   timeZone: 'America/Chicago' },
    };

    const response = await calendar.events.insert({
      calendarId,
      resource: event,
    });

    console.log(`[GCAL] ✅ Event created: ${response.data.htmlLink}`);
    return response.data;
  } catch (err) {
    console.error('[GCAL] ❌ Failed to create event:', err.message);
    if (err.errors) console.error('[GCAL] Details:', JSON.stringify(err.errors));
    return null; // non-fatal — don't break the main flow
  }
}

/**
 * Test the Google Calendar connection — returns { ok, message, link? }
 */
async function testCalendarConnection() {
  // Diagnostic: check what the private key looks like without exposing it
  const rawKey = process.env.GOOGLE_PRIVATE_KEY || '';
  const normalised = rawKey.replace(/\\n/g, '\n');
  const keyDiag = {
    rawLength: rawKey.length,
    normalisedLength: normalised.length,
    startsCorrectly: normalised.startsWith('-----BEGIN'),
    endsCorrectly: normalised.trimEnd().endsWith('-----'),
    containsNewlines: normalised.includes('\n'),
    clientEmail: process.env.GOOGLE_CLIENT_EMAIL || '(not set)',
    calendarId: process.env.GOOGLE_CALENDAR_ID || '(not set)',
  };
  console.log('[GCAL] Key diagnostic:', JSON.stringify(keyDiag));

  try {
    const { calendar, calendarId } = getCalendar();
    const testStart = new Date();
    testStart.setMinutes(testStart.getMinutes() + 5); // 5 min from now
    const testEnd = new Date(testStart.getTime() + 30 * 60 * 1000);

    const response = await calendar.events.insert({
      calendarId,
      resource: {
        summary: '✅ CAD Tracker — Calendar Connected!',
        description: 'This test event confirms Google Calendar integration is working.',
        start: { dateTime: testStart.toISOString(), timeZone: 'America/Chicago' },
        end:   { dateTime: testEnd.toISOString(),   timeZone: 'America/Chicago' },
      },
    });

    return { ok: true, message: 'Event created successfully', link: response.data.htmlLink, keyDiag };
  } catch (err) {
    return { ok: false, message: err.message, details: err.errors || null, keyDiag };
  }
}

module.exports = { createCalendarEvent, testCalendarConnection };
