import { runLaps } from './lap.mjs';
const a = process.argv[2] || 'skill';
if (a === 'skill') for (const skill of [1, 0.8, 0.6, 0.4]) runLaps({ laps: 2, skill });
if (a === 'tyre') for (const tyre of ['soft', 'medium', 'hard', 'rain']) runLaps({ laps: 6, tyre, fuel: 30 });
if (a === 'setup') for (const setup of ['high', 'mid', 'low']) runLaps({ laps: 2, setup });
if (a === 'wet') for (const [tyre, wet] of [['soft', 0.3], ['rain', 0.3], ['soft', 0.6], ['rain', 0.6], ['medium', 1], ['rain', 1]]) runLaps({ laps: 2, tyre, wet });
if (a === 'fuel') for (const fuel of [10, 60, 150]) runLaps({ laps: 2, fuel, tyre: 'medium' });
if (a === 'power') for (const power of [1, 0.97, 0.94]) runLaps({ laps: 2, power });
