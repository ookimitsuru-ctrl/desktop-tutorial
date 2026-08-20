'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { admin, db } = require('./lib/firestore');
const { todayJst } = require('./lib/dateUtil');
const { MAX_MESSAGE_LENGTH, MIN_MESSAGE_INTERVAL_MS, REGION } = require('./lib/config');

function stripControlChars(str) {
  let result = '';
  for (const ch of str) {
    const code = ch.codePointAt(0);
    const isControl = code < 0x20 || code === 0x7f;
    if (!isControl) result += ch;
  }
  return result;
}

exports.postMessage = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError('unauthenticated', 'Sign in is required.');
  }
  const uid = request.auth.uid;

  const rawText = typeof request.data?.text === 'string' ? request.data.text : '';
  const text = stripControlChars(rawText.trim());
  if (!text) {
    throw new HttpsError('invalid-argument', 'Message text is empty.');
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    throw new HttpsError('invalid-argument', `Message exceeds ${MAX_MESSAGE_LENGTH} characters.`);
  }

  const dateId = todayJst();
  const epochRef = db.collection('dailyEpochs').doc(dateId);
  const assignmentRef = epochRef.collection('assignments').doc(uid);
  const assignmentSnap = await assignmentRef.get();

  if (!assignmentSnap.exists) {
    // This is the write-permission check: writes to rooms/messages are
    // locked down in Firestore rules, so this callable is the only path in —
    // and it only proceeds for a uid actually assigned to today's room.
    throw new HttpsError('failed-precondition', 'Call assignToday before posting.');
  }

  const { municipalityId } = assignmentSnap.data();
  const roomRef = epochRef.collection('rooms').doc(municipalityId);
  const memberRef = roomRef.collection('members').doc(uid);

  // Basic anti-spam guard, not the moderation system the README defers.
  // Uses its own lastMessageAt field (distinct from touchActive's
  // lastActiveAt) so presence heartbeats don't falsely trip this check.
  const memberSnap = await memberRef.get();
  const lastMessageAt = memberSnap.exists ? memberSnap.data().lastMessageAt : null;
  if (lastMessageAt && Date.now() - lastMessageAt.toMillis() < MIN_MESSAGE_INTERVAL_MS) {
    throw new HttpsError('resource-exhausted', 'Sending messages too quickly.');
  }

  const now = admin.firestore.FieldValue.serverTimestamp();
  const messageRef = roomRef.collection('messages').doc();

  await db.runTransaction(async (tx) => {
    tx.set(messageRef, { uid, text, createdAt: now });
    tx.set(roomRef, { lastMessageAt: now }, { merge: true });
    tx.set(memberRef, { uid, lastMessageAt: now }, { merge: true });
  });

  return { messageId: messageRef.id, municipalityId, dateId };
});
