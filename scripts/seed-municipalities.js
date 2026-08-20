'use strict';

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const BATCH_SIZE = 500;

function normalize(rawMuniJson) {
  // ASSUMPTION: the real muni.json shape from [[cityconquer-project]]
  // (塗るタウン！) is not available in this environment. Guessed shape is a
  // flat array of { code, prefecture, city, kana? }. This function is the
  // one seam that should need editing once the real shape is confirmed —
  // nothing else in this script depends on it.
  return rawMuniJson.map((m) => ({
    id: String(m.code),
    prefecture: m.prefecture,
    city: m.city,
    name: `${m.prefecture}${m.city}`,
    kana: m.kana ?? null,
  }));
}

function parseArgs(argv) {
  const args = { file: path.resolve(process.cwd(), 'muni.json'), dryRun: false };
  for (const arg of argv) {
    if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (!arg.startsWith('--')) {
      args.file = path.resolve(process.cwd(), arg);
    }
  }
  return args;
}

async function main() {
  const { file, dryRun } = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(file)) {
    console.error(`muni.json not found at ${file}`);
    console.error('Usage: npm run seed -- [path/to/muni.json] [--dry-run]');
    process.exitCode = 1;
    return;
  }

  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  const municipalities = normalize(raw);

  const byPrefecture = municipalities.reduce((acc, m) => {
    acc[m.prefecture] = (acc[m.prefecture] || 0) + 1;
    return acc;
  }, {});

  console.log(
    `Parsed ${municipalities.length} municipalities across ${Object.keys(byPrefecture).length} prefectures.`
  );

  if (dryRun) {
    console.log('--dry-run: no writes performed. Sample:', municipalities.slice(0, 3));
    return;
  }

  if (!process.env.FIREBASE_PROJECT_ID && !process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('Set FIREBASE_PROJECT_ID (and GOOGLE_APPLICATION_CREDENTIALS for production),');
    console.error('or FIRESTORE_EMULATOR_HOST to seed the local emulator instead.');
    process.exitCode = 1;
    return;
  }

  admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
  const db = admin.firestore();

  for (let i = 0; i < municipalities.length; i += BATCH_SIZE) {
    const chunk = municipalities.slice(i, i + BATCH_SIZE);
    const batch = db.batch();
    for (const m of chunk) {
      const ref = db.collection('municipalities').doc(m.id);
      batch.set(
        ref,
        {
          prefecture: m.prefecture,
          city: m.city,
          name: m.name,
          kana: m.kana,
          active: true,
          rand: Math.random(),
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    }
    await batch.commit();
    console.log(`Seeded ${Math.min(i + BATCH_SIZE, municipalities.length)}/${municipalities.length}`);
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
