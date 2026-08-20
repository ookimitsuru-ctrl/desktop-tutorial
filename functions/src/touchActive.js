'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { admin, db } = require('./lib/firestore');
const { todayJst } = require('./lib/dateUtil');
const { REGION } = require('./lib/config');

const PRESENCE_TTL_MS = 24 * 60 * 60 * 1000;

exports.touchActive = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in is required.');
  }
  const uid = request.auth.uid;
  const now = admin.firestore.FieldValue.serverTimestamp();
  const expiresAt = admin.firestore.Timestamp.fromMillis(Date.now() + PRESENCE_TTL_MS);

  // Global liveness heartbeat. Decoupled from matchmaking on purpose — it's
  // a presence signal / groundwork for future features, not an input to
  // assignToday's room-selection logic.
  await db
    .collection('presence')
    .doc(uid)
    .set({ uid, lastActiveAt: now, expiresAt }, { merge: true });

  const dateId = todayJst();
  const assignmentSnap = await db
    .collection('dailyEpochs')
    .doc(dateId)
    .collection('assignments')
    .doc(uid)
    .get();

  if (assignmentSnap.exists) {
    const { municipalityId } = assignmentSnap.data();
    await db
      .collection('dailyEpochs')
      .doc(dateId)
      .collection('rooms')
      .doc(municipalityId)
      .collection('members')
      .doc(uid)
      .set({ uid, lastActiveAt: now }, { merge: true });
  }

  return { ok: true };
});
