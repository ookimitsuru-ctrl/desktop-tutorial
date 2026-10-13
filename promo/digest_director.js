'use strict';
// ============================================================
//  digest_director.js  ゲーム画面そのままのダイジェスト PV (字幕なし, 30 秒)
//   1 回のレースを最初から最後まで自動運転 (pv_director.js の PV.step) で走り,
//   見どころを BGM (夏の曲) の小節に合わせて切り出す。
//   1 回目 (scan): 走りきって チェックポイント・ゴール・追い越し・カーブ を記録し, カット割りを決める
//   2 回目 (run):  同じ乱数でもう一度走り, 選んだ区間だけ画像を書き出す
//   どちらも毎コマ描画まで行う (描画で使う乱数も同じ順番にするため)
// ============================================================
(function () {
  var DG = window.DG = {};
  var FPS = 60, BAR = G.Music.songBar('summer'), DUR = 30, GO_T = 3.0;   // BAR: 夏の曲の 1 小節。GO! をビデオの 3 秒目に
  var Game, P, I, R, T;

  // カットの境目 (ビデオのコマ番号)。スタートは GO の 1 小節後まで, あとは小節単位
  //  スタート | 夏 2 小節 | 秋へのチェックポイント 3 | 秋のカーブ 2 | 冬 2 | 春 2 | ゴール (残り)
  function bounds() {
    var b = [0, GO_T + BAR], t = b[1];
    [2, 3, 2, 2, 2].forEach(function (n) { t += n * BAR; b.push(t); });
    b.push(DUR);
    return b.map(function (x) { return Math.round(x * FPS); });
  }
  DG.bounds = bounds;

  function init() {
    PV.init();
    Game = G.Game; P = Game.player; I = G.Input; R = G.R; T = G.Track;
    G.noHud = false;        // 計器も操作 UI もゲームのまま
    Game.mode = 'hard';
  }
  function step() {
    PV.step();
    Game.render();
  }
  // 効果音はゲームが鳴らそうとしたものをそのまま記録する
  function hookSfx(cb) {
    G.Audio.sfx = function (name) { cb(name); };
  }

  var ZONE_SEA = { beach: 1 }, ZONE_MOMIJI = { momiji: 1, ginkgo: 1, shrine: 1 };

  // ---------- 1 回目: 走りきって記録 ----------
  DG.scan = function () {
    init();
    Game.startRace();
    var rec = [], cps = [], goF = -1, goalF = -1, prevState = Game.state, prevCp = 0, ahead = new Map(), f = 0;
    hookSfx(function () {});
    for (; f < FPS * 420; f++) {
      step();
      // 追い越し: 前にいた車が自車の後ろへ
      var pz = P.z + R.playerZ, passes = 0;
      Game.cars.forEach(function (c) {
        var rel = c.z - pz, was = ahead.get(c);
        if (!c.hidden && was !== undefined && was > 0 && was < T.SEG * 20 && rel <= 0 && rel > -T.SEG * 20) passes++;
        ahead.set(c, rel);
      });
      var seg = P.seg || T.segments[0];
      rec.push([seg.season, Math.abs(seg.curve), P.speed / G.MAX_SPEED, (P.crash || P.scrape) ? 1 : 0, passes,
        ZONE_SEA[seg.zone] ? 1 : (ZONE_MOMIJI[seg.zone] ? 2 : 0)]);
      if (prevState === 'countdown' && Game.state === 'race') goF = f;
      if (Game.nextCheckpoint !== prevCp) { cps.push(f); prevCp = Game.nextCheckpoint; }
      if (prevState !== 'goal' && Game.state === 'goal') goalF = f;
      prevState = Game.state;
      if (goalF >= 0 && f > goalF + FPS * 8) break;
      if (Game.state === 'timeup' || Game.state === 'gameover') break;
    }
    return { rec: rec, cps: cps, goF: goF, goalF: goalF, frames: f, incidents: rec.filter(function (r) { return r[3]; }).length };
  };

  // 区間に事故 (追突のスピン, 木を擦る) がないか
  function clean(rec, a, n) { for (var i = a; i < a + n; i++) if (!rec[i] || rec[i][3]) return false; return true; }
  // 見どころ探し: 追い越し・カーブ・景色 (海沿い / 紅葉) の点数が高い区間
  function best(rec, from, to, n, zoneWant) {
    var bestF = from, bestS = -1e9;
    for (var a = from; a + n < to; a += 10) {
      if (!clean(rec, a, n)) continue;
      var s = 0;
      for (var i = a; i < a + n; i++) {
        var r = rec[i];
        s += r[4] * 40 + r[1] * 0.6 + (r[5] === zoneWant ? 2.5 : 0) + (r[2] > 0.9 ? 1 : 0);
      }
      if (s > bestS) { bestS = s; bestF = a; }
    }
    return bestF;
  }
  function firstClean(rec, a, n) {
    for (var k = 0; k < 12; k++, a += 20) if (clean(rec, a, n)) return a;
    return a;
  }

  DG.plan = function (s) {
    var B = bounds(), len = function (k) { return B[k + 1] - B[k]; }, rec = s.rec;
    var starts = [
      s.goF - Math.round(GO_T * FPS) - 1,                                     // スタート: 3, 2, 1, GO! (最初のコマで「3」が鳴る)
      best(rec, s.goF + 6 * FPS, s.cps[0] - 10 * FPS, len(1), 1),            // 夏の海沿い
      s.cps[0] - Math.round(BAR * FPS),                                       // チェックポイントを 1 小節目の頭で通過 → 秋へ
      best(rec, s.cps[0] + 8 * FPS, s.cps[1] - 6 * FPS, len(3), 2),          // 秋のカーブ
      firstClean(rec, s.cps[1] + 2 * FPS, len(4)),                            // 冬 (季節名が出るところから)
      firstClean(rec, s.cps[2] + 2 * FPS, len(5)),                            // 春
      s.goalF - Math.round(2 * BAR * FPS)                                     // ゴールを 2 小節目の頭で
    ];
    return { starts: starts, B: B };
  };

  // ---------- 2 回目: 同じ走りを再生して, 選んだ区間を書き出す ----------
  var plan, simF, sfxLog, engLog, wins;
  DG.begin = function (pl) {
    plan = pl;
    init();
    Game.startRace();
    simF = 0; sfxLog = []; engLog = [];
    wins = pl.starts.map(function (st, k) { return { a: st, n: pl.B[k + 1] - pl.B[k], v0: pl.B[k] }; });
    hookSfx(function (name) {
      var v = videoFrame(simF);
      if (v >= 0) sfxLog.push({ t: v / FPS, name: name });
    });
  };
  function videoFrame(f) {
    for (var k = 0; k < wins.length; k++) {
      var w = wins[k];
      if (f >= w.a && f < w.a + w.n) return w.v0 + (f - w.a);
    }
    return -1;
  }
  // n コマ進めて, その間に撮るコマを返す
  DG.run = function (n) {
    var out = [], last = wins[wins.length - 1];
    for (var i = 0; i < n && simF < last.a + last.n; i++) {
      step();
      var v = videoFrame(simF);
      if (v >= 0) {
        out.push({ v: v, url: R.canvas.toDataURL('image/png') });
        engLog[v] = [P.rpm, P.speed / G.MAX_SPEED, P.skid, P.throttle ? 1 : 0, P.offroad ? 1 : 0, P.scrape ? 1 : 0];
      }
      simF++;
    }
    return { frames: out, done: simF >= last.a + last.n };
  };
  DG.events = function () { return sfxLog; };

  // ---------- 音: ゲームと同じ FM 音源の BGM, 効果音, エンジン音をオフラインで合成 ----------
  DG.renderAudio = function () {
    var SR = 44100;
    var oc = new OfflineAudioContext(2, SR * DUR, SR);
    var master = oc.createGain(); master.gain.value = 0.95;
    master.gain.setValueAtTime(0.95, DUR - 0.6); master.gain.linearRampToValueAtTime(0, DUR - 0.02);   // 最後は映像と一緒に消える
    var comp = oc.createDynamicsCompressor();
    comp.threshold.value = -12; comp.knee.value = 6; comp.ratio.value = 5; comp.attack.value = 0.004; comp.release.value = 0.2;
    master.connect(comp); comp.connect(oc.destination);
    var M = G.Music;
    var goal = sfxLog.filter(function (e) { return e.name === 'goal'; })[0];
    var go = sfxLog.filter(function (e) { return e.name === 'go'; })[0];
    var gT = goal ? goal.t : DUR, goT = go ? go.t : GO_T;

    // BGM: GO から夏の曲, ゴールの瞬間にファンファーレ → ビクトリーの曲 (ゲームと同じ)
    var m1 = oc.createGain(); m1.connect(master);
    m1.gain.setValueAtTime(1.3, 0);
    M.renderOffline(oc, m1, 'summer', goT, gT);
    m1.gain.setValueAtTime(1.3, gT - 0.03); m1.gain.linearRampToValueAtTime(0, gT + 0.06);
    if (gT < DUR) {
      var m2 = oc.createGain(); m2.connect(master); m2.gain.value = 1.3;
      M.renderOffline(oc, m2, 'victory', gT, DUR + 0.5);
    }

    var sfx = oc.createGain(); sfx.gain.value = 1.0; sfx.connect(master);
    var nb = oc.createBuffer(1, SR * 2, SR), nd = nb.getChannelData(0);
    for (var i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;
    function nsrc() { var s = oc.createBufferSource(); s.buffer = nb; s.loop = true; return s; }
    // 効果音はゲームの音 (audio.js) をそのまま鳴らす: カウントダウン, チェックポイント, 拍手, 花火…
    sfxLog.forEach(function (e) { G.Audio.renderSfx(oc, sfx, e.name, e.t); });

    // エンジン (3 気筒ターボ風) と走行音: 撮ったコマの回転数・速度に追従 (カットの所で切り替わる)
    var eng = oc.createGain(); eng.gain.value = 0; eng.connect(master);
    var flt = oc.createBiquadFilter(); flt.type = 'lowpass'; flt.Q.value = 2.5;
    var am = oc.createGain(); am.gain.value = 0.6;
    flt.connect(am); am.connect(eng);
    var o1 = oc.createOscillator(); o1.type = 'sawtooth';
    var o2 = oc.createOscillator(); o2.type = 'square';
    var g2 = oc.createGain(); g2.gain.value = 0.5;
    o1.connect(flt); o2.connect(g2); g2.connect(flt);
    var lfo = oc.createOscillator(); lfo.type = 'triangle';
    var lfoG = oc.createGain(); lfoG.gain.value = 0.35; lfo.connect(lfoG); lfoG.connect(am.gain);
    var tb = oc.createOscillator(), tbG = oc.createGain(); tbG.gain.value = 0; tb.connect(tbG); tbG.connect(master);
    function noiseChain(type, f, q) {
      var s = nsrc(), fl = oc.createBiquadFilter(), g = oc.createGain();
      fl.type = type; fl.frequency.value = f; fl.Q.value = q; g.gain.value = 0;
      s.connect(fl); fl.connect(g); g.connect(master); s.start(0);
      return g;
    }
    var skG = noiseChain('bandpass', 1100, 3), wdG = noiseChain('bandpass', 700, 0.6), rbG = noiseChain('lowpass', 180, 1);
    // 擦る音 「ガガガ」
    var scS = nsrc(), scBp = oc.createBiquadFilter(); scBp.type = 'bandpass'; scBp.frequency.value = 1300; scBp.Q.value = 0.9;
    var scGr = oc.createOscillator(); scGr.type = 'sawtooth';
    var scLp = oc.createBiquadFilter(); scLp.type = 'lowpass'; scLp.frequency.value = 420;
    var scGrG = oc.createGain(); scGrG.gain.value = 0.55;
    var scAM = oc.createGain(); scAM.gain.value = 0.5;
    var scLfo = oc.createOscillator(); scLfo.type = 'square';
    var scLfoG = oc.createGain(); scLfoG.gain.value = 0.5; scLfo.connect(scLfoG); scLfoG.connect(scAM.gain);
    var scG = oc.createGain(); scG.gain.value = 0;
    scS.connect(scBp); scBp.connect(scAM); scGr.connect(scLp); scLp.connect(scGrG); scGrG.connect(scAM); scAM.connect(scG); scG.connect(master);
    scS.start(0);
    [o1, o2, lfo, tb, scGr, scLfo].forEach(function (o) { o.start(0); });
    engLog.forEach(function (L, v) {
      if (!L) return;
      var t = v / FPS, rpm = L[0], sp = L[1], skid = L[2], thr = L[3], off = L[4], scr = L[5];
      var f = 16 + rpm * 100;   // ゲームと同じ: rpm / 7000 に比例
      o1.frequency.setValueAtTime(f, t); o2.frequency.setValueAtTime(f * 0.5, t); lfo.frequency.setValueAtTime(f * 0.5, t);
      flt.frequency.setValueAtTime(200 + rpm * 1150 + sp * 300, t);
      eng.gain.setValueAtTime((0.06 + rpm * 0.05) * (thr ? 1.15 : 0.85), t);
      tb.frequency.setValueAtTime(1600 + rpm * 2400, t);
      tbG.gain.setValueAtTime(thr && sp > 0.1 ? 0.003 + rpm * 0.005 : 0, t);
      skG.gain.setValueAtTime(skid * 0.08, t);
      wdG.gain.setValueAtTime(sp * sp * 0.04, t);
      rbG.gain.setValueAtTime(off && sp > 0.05 ? 0.3 : 0, t);
      scG.gain.setValueAtTime(scr ? 0.34 + sp * 0.4 : 0, t);
      scLfo.frequency.setValueAtTime(15 + sp * 20, t); scGr.frequency.setValueAtTime(48 + sp * 40, t);
    });

    return oc.startRendering().then(function (buf) {
      var Lc = buf.getChannelData(0), Rc = buf.getChannelData(1), n = Lc.length, peak = 0;
      for (var j = 0; j < n; j++) peak = Math.max(peak, Math.abs(Lc[j]), Math.abs(Rc[j]));
      var gn = peak > 0 ? 0.89 / peak : 1;
      var ab = new ArrayBuffer(44 + n * 4), dv = new DataView(ab);
      function str(o, s2) { for (var q = 0; q < s2.length; q++) dv.setUint8(o + q, s2.charCodeAt(q)); }
      str(0, 'RIFF'); dv.setUint32(4, 36 + n * 4, true); str(8, 'WAVE'); str(12, 'fmt ');
      dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 2, true); dv.setUint32(24, SR, true);
      dv.setUint32(28, SR * 4, true); dv.setUint16(32, 4, true); dv.setUint16(34, 16, true); str(36, 'data'); dv.setUint32(40, n * 4, true);
      for (j = 0; j < n; j++) {
        dv.setInt16(44 + j * 4, Math.max(-1, Math.min(1, Lc[j] * gn)) * 32767, true);
        dv.setInt16(46 + j * 4, Math.max(-1, Math.min(1, Rc[j] * gn)) * 32767, true);
      }
      var bytes = new Uint8Array(ab), out = '', CH = 0x8000;
      for (j = 0; j < bytes.length; j += CH) out += String.fromCharCode.apply(null, bytes.subarray(j, j + CH));
      return { wav: btoa(out), peak: peak };
    });
  };
})();
