// Copy this file to firebase-config.js (gitignored) and fill in the values
// from Firebase Console > Project settings > General > Your apps > Web app.
//
// This config is not secret — Firebase web config is safe to expose
// publicly. It's gitignored to keep per-environment project IDs out of a
// shared repo, not for secrecy. Real security is enforced by
// firestore.rules and the Cloud Functions.
window.FIREBASE_CONFIG = {
  apiKey: 'YOUR_API_KEY',
  authDomain: 'YOUR_PROJECT_ID.firebaseapp.com',
  projectId: 'YOUR_PROJECT_ID',
  storageBucket: 'YOUR_PROJECT_ID.appspot.com',
  messagingSenderId: 'YOUR_SENDER_ID',
  appId: 'YOUR_APP_ID',
};
