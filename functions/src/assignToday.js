'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { admin, db } = require('./lib/firestore');
const { todayJst } = require('./lib/dateUtil');
const { TARGET_GROUP_SIZE, REGION } = require('./lib/config');

const MAX_RETRIES = 5;

// README says targetGroupSize is a "目標" (target), not a hard cap, so
// grouping here is soft: prefer filling an existing open room before
// activating a fresh municipality. One room per municipality per day —
// no sharding/instances. See README for the fuller rationale.

async function ensureEpoch(dateId) {
  const epochRef = db.collection('dailyEpochs').doc(dateId);
  const snap = await epochRef.get();
  if (!snap.exists) {
    // Self-heal: covers the case where a request arrives before
    // dailyRollover's scheduled run has fired for the day (e.g. scheduler
    // jitter, or the very first day before any run has happened yet).
    await epochRef.set(
      {
        date: admin.firestore.Timestamp.fromDate(new Date(`${dateId}T00:00:00+09:00`)),
        status: 'active',
        rolloverAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: 'assignToday-selfheal',
      },
      { merge: true }
    );
  }
  return epochRef;
}

async function pickOpenRoom(epochRef) {
  const snap = await epochRef
    .collection('rooms')
    .where('status', '==', 'open')
    .orderBy('memberCount', 'desc')
    .limit(5)
    .get();
  if (snap.empty) return null;
  const docs = snap.docs;
  return docs[Math.floor(Math.random() * docs.length)].id;
}

async function pickRandomMunicipalityId() {
  // Firestore has no native "random row" query, so municipalities are
  // seeded with a random `rand` field and we range-query off it, with
  // wraparound to the start of the range if the tail comes up empty.
  const rand = Math.random();
  let snap = await db
    .collection('municipalities')
    .where('active', '==', true)
    .where('rand', '>=', rand)
    .orderBy('rand', 'asc')
    .limit(1)
    .get();
  if (snap.empty) {
    snap = await db
      .collection('municipalities')
      .where('active', '==', true)
      .orderBy('rand', 'asc')
      .limit(1)
      .get();
  }
  if (snap.empty) return null;
  return snap.docs[0].id;
}

exports.assignToday = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in is required.');
  }
  const uid = request.auth.uid;
  const dateId = todayJst();
  const epochRef = await ensureEpoch(dateId);
  const assignmentRef = epochRef.collection('assignments').doc(uid);

  // Fast path: calling this twice in a day is a cheap single read, not a
  // reassignment.
  const existing = await assignmentRef.get();
  if (existing.exists) {
    return { ...existing.data(), dateId };
  }

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    let municipalityId = await pickOpenRoom(epochRef);
    if (!municipalityId) {
      municipalityId = await pickRandomMunicipalityId();
      if (!municipalityId) {
        throw new HttpsError(
          'failed-precondition',
          'No municipalities are available. Has the master data been seeded (npm run seed)?'
        );
      }
    }

    const roomRef = epochRef.collection('rooms').doc(municipalityId);

    try {
      const result = await db.runTransaction(async (tx) => {
        // Re-check inside the transaction: this is the actual correctness
        // guarantee against a concurrent call for the same uid — the read
        // above is only a fast-path optimization.
        const assignmentSnap = await tx.get(assignmentRef);
        if (assignmentSnap.exists) {
          return { alreadyAssigned: true, data: assignmentSnap.data() };
        }

        const roomSnap = await tx.get(roomRef);
        const now = admin.firestore.FieldValue.serverTimestamp();

        if (!roomSnap.exists) {
          tx.set(roomRef, {
            municipalityId,
            memberCount: 1,
            targetGroupSize: TARGET_GROUP_SIZE,
            status: 1 >= TARGET_GROUP_SIZE ? 'full' : 'open',
            lastMessageAt: null,
            createdAt: now,
          });
        } else {
          const room = roomSnap.data();
          if (room.status === 'full') {
            throw new Error('ROOM_FULL');
          }
          const memberCount = room.memberCount + 1;
          tx.update(roomRef, {
            memberCount,
            status: memberCount >= room.targetGroupSize ? 'full' : 'open',
          });
        }

        tx.set(roomRef.collection('members').doc(uid), {
          uid,
          joinedAt: now,
          lastActiveAt: null,
          lastMessageAt: null,
        });

        const assignmentData = { uid, municipalityId, assignedAt: now };
        tx.set(assignmentRef, assignmentData);

        return { alreadyAssigned: false, data: assignmentData };
      });

      if (result.alreadyAssigned) {
        return { ...result.data, dateId };
      }
      return { uid, municipalityId, dateId };
    } catch (err) {
      if (err.message === 'ROOM_FULL') {
        continue; // room filled up since we picked it — retry selection
      }
      throw err;
    }
  }

  throw new HttpsError('aborted', 'Could not assign a room after multiple attempts. Please retry.');
});
