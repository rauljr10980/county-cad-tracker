const { google } = require('googleapis');

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID;
const CLIENT_EMAIL = process.env.GOOGLE_CLIENT_EMAIL;
const PRIVATE_KEY = (process.env.GOOGLE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

function getCalendar() {
  if (!CLIENT_EMAIL || !PRIVATE_KEY || !CALENDAR_ID) {
    throw new Error('Google Calendar env vars not set (GOOGLE_CLIENT_EMAIL, GOOGLE_PRIVATE_KEY, GOOGLE_CALENDAR_ID)');
  }

  const auth = new google.auth.JWT(
    CLIENT_EMAIL,
    null,
    PRIVATE_KEY,
    ['https://www.googleapis.com/auth/calendar']
  );

  return google.calendar({ version: 'v3', auth });
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
    const calendar = getCalendar();

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
      calendarId: CALENDAR_ID,
      resource: event,
    });

    console.log(`[GCAL] Event created: ${response.data.htmlLink}`);
    return response.data;
  } catch (err) {
    console.error('[GCAL] Failed to create event:', err.message);
    return null; // non-fatal — don't break the main flow
  }
}

module.exports = { createCalendarEvent };
