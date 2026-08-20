'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { logger } = require('firebase-functions/v2');
const { admin, db } = require('./lib/firestore');
const { todayJst, addDaysToDateId, TIME_ZONE } = require('./lib/dateUtil');
const { RETENTION_DAYS, REGION } = require('./lib/config');

// Scheduled once daily (requires Blaze plan for Cloud Scheduler — see README).
// "Rollover" just means: make sure today's dailyEpochs container exists.
// Nothing needs to be reset — yesterday's assignments/rooms live under
// dailyEpochs/{yesterday} and are naturally inert once clients read/write
// under dailyEpochs/{today} instead.
exports.dailyRollover = onSchedule(
  { schedule: '0 0 * * *', timeZone: TIME_ZONE, region: REGION },
  async () => {
    const dateId = todayJst();
    const epochRef = db.collection('dailyEpochs').doc(dateId);
    const epochSnap = await epochRef.get();

    if (epochSnap.exists) {
      logger.info(`dailyRollover: dailyEpochs/${dateId} already exists, skipping`);
    } else {
      await epochRef.set({
        date: admin.firestore.Timestamp.fromDate(new Date(`${dateId}T00:00:00+09:00`)),
        status: 'active',
        rolloverAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'dailyRollover',
      });
      logger.info(`dailyRollover: created dailyEpochs/${dateId}`);
    }

    // Bounded cleanup: delete exactly one expiring day's subtree per run,
    // so cost stays independent of how much history has accumulated.
    const expiredDateId = addDaysToDateId(dateId, -RETENTION_DAYS);
    const expiredRef = db.collection('dailyEpochs').doc(expiredDateId);
    const expiredSnap = await expiredRef.get();
    if (expiredSnap.exists) {
      await db.recursiveDelete(expiredRef);
      logger.info(`dailyRollover: deleted expired dailyEpochs/${expiredDateId}`);
    }
  }
);
