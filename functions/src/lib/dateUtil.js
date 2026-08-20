'use strict';

// Single source of truth for "what day is it" across all functions.
// dailyRollover's Cloud Scheduler trigger uses the same TIME_ZONE, so the
// two must never drift apart (see README) or assignments will land under
// a dateId that doesn't match the day's room.
const TIME_ZONE = 'Asia/Tokyo';

const JST_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function todayJst(now = new Date()) {
  // en-CA formats as YYYY-MM-DD, which is exactly the dateId shape we want.
  return JST_FORMATTER.format(now);
}

function addDaysToDateId(dateId, days) {
  const [y, m, d] = dateId.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

module.exports = { TIME_ZONE, todayJst, addDaysToDateId };
