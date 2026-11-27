// 自車がスピンして止まったとき、後続の AI が詰まらずに抜けていくかを調べる
//   node tests/spin.mjs "" '[["suzuka",1000,"S字"]]'      (第1引数に original を渡すとオリジナル版のコース)
// 自車がスピンして横向きに止まったとき、後続の AI が抜けるか (詰まらないか) を調べる
const base = '/home/user/desktop-tutorial/src/';
const { buildTrack } = await import(base + 'track.js');
const { computeRacingLine, Driver } = await import(base + 'ai.js');
const { Session, DRIVERS } = await import(base + 'race.js');
const VAR = process.argv[2] || '';
const { TRACKS } = await import(VAR ? base + `variants/${VAR}/tracks.js` : base + 'tracks.js');
const spots = JSON.parse(process.argv[3]);   // [[コースid, s, 名前], ...]
for (const [tid, spinS, label] of spots) {
  const T = buildTrack(TRACKS[tid]), line = computeRacingLine(T);
  const g = DRIVERS.map((_, i) => i); g.splice(0, 1); g.push(0);   // 自車は最後尾スタート → 抜かれる側にならないよう、後続が多い位置で止まる
  g.splice(g.length - 1, 1); g.splice(4, 0, 0);                   // 自車を 5 番手から
  const S = new Session(T, line, { mode: 'race', laps: 3, weather: 'dry', setup: 'mid', tyre: 'soft', difficulty: 'normal', damage: true, grid: g });
  const p = S.player, d = new Driver(p.car, T, line, { skill: 0.9 });
  let lastJam = 0, spun = false, t0 = 0, passed = new Set(), stoppedMax = 0, contacts = 0, prevGap = new Map();
  while (S.time < 400) {
    const c = p.car;
    if (!spun) {
      if (S.state === 'green') { d.update(1 / 60, S.wet, S.cars, {}); Object.assign(S.playerInput, { throttle: c.throttle, brake: c.brake, steer: c.steerIn }); }
      else Object.assign(S.playerInput, { throttle: 0, brake: 1, steer: 0 });
      if (S.state === 'green' && S.raceTime > 20 && Math.abs(T.sDiff(c.s, spinS)) < 6) {
        // スピン: 進行方向に対して横向きで止まる (走行ライン上)
        spun = true; t0 = S.time; const i = T.idx(c.s);
        c.yaw = Math.atan2(T.ty[i], T.tx[i]) + Math.PI / 2; c.vx = c.vy = c.r = 0; c.wF = c.wR = 0;
        for (const e of S.entries) if (e !== p) prevGap.set(e, T.sDiff(e.car.s, c.s));
      }
    } else {
      Object.assign(S.playerInput, { throttle: 0, brake: 1, steer: 0 });
      let stopped = 0;
      for (const e of S.entries) { if (e === p || e.out || e.retired) continue;
        const gp = T.sDiff(e.car.s, c.s), pg = prevGap.get(e); if (pg != null && pg < 0 && gp >= 0 && gp < 50) passed.add(e); prevGap.set(e, gp);
        if (gp < 0 && gp > -120 && e.car.speed < 2) stopped++; }
      stoppedMax = Math.max(stoppedMax, stopped); if (stopped > 0) lastJam = S.time - t0;
      if (S.time - t0 > 25 || p.retired) break;
    }
    for (const ev of S.events) if (spun && ev.type === 'contact') contacts++;
    S.tick(1 / 60); S.events.length = 0;
  }
  const behindAtSpin = [...prevGap.keys()].length;
  console.log(`${tid} ${label}: スピンから25秒で抜いた台数 ${passed.size}  後ろで止まった最大台数 ${stoppedMax}  詰まりが解けるまで ${lastJam.toFixed(1)}秒  自車への接触 ${contacts}  (自車の位置 P${p.pos})${p.retired ? '  ※自車が大破してリタイア (実際のゲームではここで決勝が終わる)' : ''}`);
}
