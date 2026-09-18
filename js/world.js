/* 星の箱庭 — シミュレーション(星・漂流物・できごと) */
window.Hakoniwa = window.Hakoniwa || {};
(function (H) {
  'use strict';

  var U = H.util, TAU = U.TAU, rand = U.rand, randInt = U.randInt, clamp = U.clamp;

  H.radiusOf = function (mass) {
    return H.BASE_RADIUS * Math.cbrt(mass / H.START_MASS);
  };

  H.pixelRadiusOf = function (radius, bounds) {
    var band = bounds.band || bounds.h;
    var fit = clamp(Math.min(bounds.w, band) / 520, 0.62, 1.15);
    return 46 * Math.pow(radius / H.BASE_RADIUS, 0.45) * fit;
  };

  H.fractions = function (w) {
    var c = w.comp;
    var total = c.rock + c.ice + c.metal || 1;
    return { rock: c.rock / total, ice: c.ice / total, metal: c.metal / total };
  };

  H.createWorld = function () {
    var w = {
      name: 'N-01',
      mass: H.START_MASS,
      comp: { rock: H.START_MASS, ice: 0, metal: 0 },
      life: 0,
      counts: { meteor: 0, dust: 0, wreck: 0, seed: 0 },
      marks: [],
      features: [],
      debris: [],
      effects: [],
      comet: null,
      unlocked: {},
      log: [],
      elapsed: 0,
      rotation: 0,
      days: 0,
      shake: 0,
      spawnTimer: rand(0.2, 0.8),
      eventTimer: rand(20, 40),
      seenEvent: {},
      bounds: { w: 960, h: 600 },
      radius: H.BASE_RADIUS,
      pixelRadius: 46,
      fresh: true
    };
    w.pixelRadius = H.pixelRadiusOf(w.radius, w.bounds);
    return w;
  };

  H.addLog = function (w, title, text) {
    w.log.push({ day: w.days, title: title, text: text, fresh: true });
    if (w.log.length > 48) w.log.shift();
  };

  /* ---------------- 漂流物 ---------------- */

  function pickType() {
    var total = 0, i;
    for (i = 0; i < H.DEBRIS_TYPES.length; i++) total += H.DEBRIS_TYPES[i].weight;
    var r = Math.random() * total;
    for (i = 0; i < H.DEBRIS_TYPES.length; i++) {
      r -= H.DEBRIS_TYPES[i].weight;
      if (r <= 0) return H.DEBRIS_TYPES[i];
    }
    return H.DEBRIS_TYPES[0];
  }

  function spawnRadius(w, angle) {
    var b = w.bounds;
    var cx = b.cx == null ? b.w * 0.5 : b.cx;
    var cy = b.cy == null ? b.h * 0.5 : b.cy;
    if (angle == null) return Math.hypot(Math.max(cx, b.w - cx), Math.max(cy, b.h - cy)) + 90;
    var c = Math.cos(angle), s = Math.sin(angle);
    var dx = c > 0 ? b.w - cx : cx, dy = s > 0 ? b.h - cy : cy;
    var edge = Math.min(Math.abs(c) > 1e-4 ? dx / Math.abs(c) : 1e9, Math.abs(s) > 1e-4 ? dy / Math.abs(s) : 1e9);
    return edge + 70;
  }

  /* 星が大きいほど、たくさん・大きいものを引き寄せる(終盤が何時間もかからないように) */
  H.influx = function (w) {
    var ratio = w.mass / H.START_MASS;
    var mass = Math.pow(ratio, 0.35);
    return { mass: mass, rate: Math.min(3.5, Math.pow(ratio, 0.2)), size: clamp(Math.pow(mass, 0.33), 1, 2.6) };
  };

  function makeDebris(w, def, angle, speedScale, spread, distScale) {
    var inf = H.influx(w);
    var a = angle + rand(-spread, spread);
    var R = spawnRadius(w, a) * rand(1.0, 1.14) * (distScale || 1);
    var x = Math.cos(a) * R, y = Math.sin(a) * R;
    var dist = Math.hypot(x, y);
    var GM = gravityParam(w);
    // 中心に向かう速度を横に振って、しばらく回ってから落ちるようにする
    var base = (Math.sqrt(GM / dist) * rand(0.62, 1.05) + 22) * speedScale;
    var toward = Math.atan2(-y, -x) + rand(-0.55, 0.55);
    var d = {
      type: def.id,
      material: def.material,
      x: x, y: y,
      vx: Math.cos(toward) * base,
      vy: Math.sin(toward) * base,
      mass: rand(def.mass[0], def.mass[1]) * inf.mass,
      size: rand(def.size[0], def.size[1]) * inf.size,
      color: def.color,
      glow: def.glow,
      spin: rand(0, TAU),
      vspin: rand(-2.2, 2.2),
      blink: rand(0, TAU),
      shape: null,
      trail: []
    };
    if (def.id === 'meteor' || def.id === 'wreck') {
      d.shape = [];
      var n = def.id === 'meteor' ? randInt(6, 9) : 4;
      for (var i = 0; i < n; i++) d.shape.push(rand(0.72, 1.15));
    }
    return d;
  }

  function addDebris(w, d) {
    if (w.debris.length >= H.MAX_DEBRIS) return;
    w.debris.push(d);
  }

  function spawnOne(w, def, angle) {
    def = def || pickType();
    angle = angle == null ? rand(0, TAU) : angle;
    if (def.burst) {
      var n = randInt(def.burst[0], def.burst[1]);
      for (var i = 0; i < n; i++) addDebris(w, makeDebris(w, def, angle, 1, 0.12));
    } else {
      addDebris(w, makeDebris(w, def, angle, 1, 0.05));
    }
  }

  /* 開いた瞬間に空が空っぽにならないよう、飛行中のものを撒いておく */
  H.seed = function (w, n) {
    for (var i = 0; i < n; i++) {
      var def = pickType();
      addDebris(w, makeDebris(w, def, rand(0, TAU), 1, 0.05, rand(0.3, 0.95)));
    }
  };

  function gravityParam(w) {
    return H.GM_BASE * Math.pow(w.mass / H.START_MASS, H.GM_EXP);
  }

  /* ---------------- 取りこみ ---------------- */

  function absorb(w, d) {
    w.mass += d.mass;
    if (d.material === 'life') w.life += d.mass;
    else w.comp[d.material] += d.mass;
    w.counts[d.type]++;

    // ぶつかった向きを経度に、緯度はばらけさせて球面にちらす
    var lon = Math.atan2(d.y, d.x) - w.rotation + rand(-0.6, 0.6);
    var lat = Math.asin(rand(-1, 1)) * 0.78;
    w.marks.push({
      lat: lat, lon: lon,
      rm: 0.26 + Math.cbrt(d.mass) * 0.22 * rand(0.85, 1.15),
      kind: d.material
    });
    if (w.marks.length > H.MAX_MARKS) w.marks.shift();

    w.effects.push({ kind: 'ring', x: d.x, y: d.y, life: 0, dur: 0.45 + d.size * 0.02,
      max: Math.min(10 + d.size * 3.6, w.pixelRadius * 0.6), color: d.glow });
    var sparks = Math.min(9, 2 + Math.round(d.size));
    for (var i = 0; i < sparks; i++) {
      var a = Math.atan2(d.y, d.x) + rand(-1.3, 1.3);
      var sp = rand(24, 90) + d.size * 5;
      w.effects.push({ kind: 'spark', x: d.x, y: d.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: 0, dur: rand(0.28, 0.6), color: d.glow });
    }
    w.shake = Math.min(8, w.shake + Math.cbrt(d.mass) * 0.55);
  }

  /* ---------------- できごと ---------------- */

  function angularGap(a, b) {
    var ax = Math.cos(a.lat) * Math.cos(a.lon), ay = Math.sin(a.lat), az = Math.cos(a.lat) * Math.sin(a.lon);
    var bx = Math.cos(b.lat) * Math.cos(b.lon), by = Math.sin(b.lat), bz = Math.cos(b.lat) * Math.sin(b.lon);
    return Math.acos(clamp(ax * bx + ay * by + az * bz, -1, 1));
  }

  function place(w, type, extra) {
    var best = null;
    for (var t = 0; t < 14; t++) {
      var cand = { lat: Math.asin(rand(-0.92, 0.92)) * 0.8, lon: rand(0, TAU) };
      var gap = Infinity;
      for (var i = 0; i < w.features.length; i++) {
        if (w.features[i].type === 'sea') continue;
        gap = Math.min(gap, angularGap(cand, w.features[i]));
      }
      if (!best || gap > best.gap) best = { lat: cand.lat, lon: cand.lon, gap: gap };
      if (gap > 0.7) break;
    }
    var f = { type: type, lat: best.lat, lon: best.lon, seed: rand(0, 1), scale: 1 };
    if (extra) for (var k in extra) f[k] = extra[k];
    w.features.push(f);
    return f;
  }

  function grantFeatures(w, id) {
    var i, base;
    switch (id) {
      case 'volcano':
        for (i = 0; i < 3; i++) place(w, 'volcano', { hot: i < 2, scale: rand(0.85, 1.15) });
        break;
      case 'sea':
        for (i = 0; i < randInt(5, 8); i++) {
          w.features.push({ type: 'sea', lat: Math.asin(rand(-1, 1)) * 0.85, lon: rand(0, TAU),
            seed: rand(0, 1), scale: rand(0.5, 1.1) });
        }
        break;
      case 'sprout':
        for (i = 0; i < 3; i++) place(w, 'tree', { scale: rand(0.8, 1.2) });
        break;
      case 'rose': place(w, 'rose'); break;
      case 'lamp': place(w, 'lamp'); break;
      case 'house': place(w, 'house'); break;
      case 'bench': place(w, 'bench'); break;
      case 'keeper':
        base = null;
        for (i = 0; i < w.features.length; i++) if (w.features[i].type === 'bench') base = w.features[i];
        if (base) w.features.push({ type: 'keeper', lat: base.lat, lon: base.lon + 0.26, seed: rand(0, 1), scale: 1 });
        else place(w, 'keeper');
        break;
      case 'named': place(w, 'signpost'); break;
    }
  }

  function meets(w, need) {
    if (!need) return true;
    var f = H.fractions(w);
    if (need.ice != null && f.ice < need.ice) return false;
    if (need.metal != null && f.metal < need.metal) return false;
    if (need.life != null && w.life < need.life) return false;
    return true;
  }

  H.nextMilestone = function (w) {
    for (var i = 0; i < H.MILESTONES.length; i++) {
      if (!w.unlocked[H.MILESTONES[i].id]) return H.MILESTONES[i];
    }
    return null;
  };

  function checkMilestones(w) {
    for (var i = 0; i < H.MILESTONES.length; i++) {
      var m = H.MILESTONES[i];
      if (w.unlocked[m.id] || w.radius < m.r || !meets(w, m.need)) continue;
      w.unlocked[m.id] = true;
      grantFeatures(w, m.id);
      H.addLog(w, m.title, m.log);
      w.effects.push({ kind: 'bloom', life: 0, dur: 1.6 });
      return m;
    }
    return null;
  }

  /* ---------------- 彗星と流星群 ---------------- */

  function startComet(w) {
    var R = spawnRadius(w) * 1.1;
    var a = rand(0, TAU);
    var off = rand(0.45, 0.95) * (Math.random() < 0.5 ? 1 : -1);
    var from = { x: Math.cos(a) * R, y: Math.sin(a) * R };
    var aim = Math.atan2(-from.y, -from.x) + off;
    w.comet = { x: from.x, y: from.y, vx: Math.cos(aim) * rand(150, 230), vy: Math.sin(aim) * rand(150, 230),
      life: 0, emit: 0, tail: [] };
    if (!w.seenEvent.comet) {
      w.seenEvent.comet = true;
      H.addLog(w, '彗星が通った', '尾を引いた星が横切っていった。散らばったチリが、これから降ってくる。');
    }
  }

  function meteorShower(w) {
    var a = rand(0, TAU), n = randInt(5, 9);
    for (var i = 0; i < n; i++) {
      var d = makeDebris(w, H.DEBRIS_TYPES[0], a, 1.05, 0.22);
      var k = 1 + i * 0.22;
      d.x *= k; d.y *= k;
      addDebris(w, d);
    }
    if (!w.seenEvent.shower) {
      w.seenEvent.shower = true;
      H.addLog(w, '流星群', 'ひとかたまりの岩が、同じ方角から次々に落ちてきた。');
    }
  }

  function updateComet(w, dt) {
    var c = w.comet;
    if (!c) return;
    c.life += dt;
    var dist = Math.hypot(c.x, c.y) || 1;
    var a = gravityParam(w) * 0.55 / (dist * dist + 900);
    c.vx += (-c.x / dist) * a * dt;
    c.vy += (-c.y / dist) * a * dt;
    c.x += c.vx * dt; c.y += c.vy * dt;
    c.tail.unshift({ x: c.x, y: c.y });
    if (c.tail.length > 26) c.tail.pop();
    c.emit -= dt;
    if (c.emit <= 0) {
      c.emit = rand(0.05, 0.14);
      var def = H.DEBRIS_TYPES[1];
      var d = {
        type: def.id, material: def.material,
        x: c.x + rand(-6, 6), y: c.y + rand(-6, 6),
        vx: c.vx * rand(-0.25, 0.1) + rand(-26, 26),
        vy: c.vy * rand(-0.25, 0.1) + rand(-26, 26),
        mass: rand(def.mass[0], def.mass[1]) * 1.4 * H.influx(w).mass,
        size: rand(def.size[0], def.size[1]) * H.influx(w).size,
        color: def.color, glow: def.glow,
        spin: 0, vspin: 0, blink: 0, shape: null, trail: []
      };
      addDebris(w, d);
    }
    if (c.life > 9 || dist > spawnRadius(w) * 1.6) w.comet = null;
  }

  /* ---------------- 1ステップ ---------------- */

  H.step = function (w, dt, input) {
    w.elapsed += dt;
    var prevDay = Math.floor(w.rotation / TAU);
    w.rotation += (dt / H.ROTATION_PERIOD) * TAU;
    var day = Math.floor(w.rotation / TAU);
    if (day !== prevDay) w.days = day;

    w.radius = H.radiusOf(w.mass);
    w.pixelRadius = H.pixelRadiusOf(w.radius, w.bounds);
    w.shake *= Math.exp(-4.5 * dt);

    w.spawnTimer -= dt;
    if (w.spawnTimer <= 0) {
      w.spawnTimer = rand(H.SPAWN_INTERVAL[0], H.SPAWN_INTERVAL[1]) / H.influx(w).rate;
      spawnOne(w);
    }
    w.eventTimer -= dt;
    if (w.eventTimer <= 0) {
      w.eventTimer = rand(26, 54);
      if (Math.random() < 0.55) startComet(w); else meteorShower(w);
    }
    updateComet(w, dt);

    var GM = gravityParam(w);
    var drag = Math.exp(-H.DRAG * dt);
    var far = spawnRadius(w) * 2.1;
    var hand = input && input.active;

    for (var i = w.debris.length - 1; i >= 0; i--) {
      var d = w.debris[i];
      var dist = Math.hypot(d.x, d.y) || 0.001;
      var g = GM / (dist * dist + 600);
      d.vx += (-d.x / dist) * g * dt;
      d.vy += (-d.y / dist) * g * dt;

      if (hand) {
        var hx = input.x - d.x, hy = input.y - d.y;
        var hd = Math.hypot(hx, hy) || 0.001;
        if (hd < H.HAND_RADIUS) {
          var f = H.HAND_STRENGTH / (hd * hd + 2600);
          d.vx += (hx / hd) * f * dt;
          d.vy += (hy / hd) * f * dt;
        }
      }

      d.vx *= drag; d.vy *= drag;
      d.x += d.vx * dt; d.y += d.vy * dt;
      d.spin += d.vspin * dt;

      if (d.trail.length > 6) d.trail.pop();
      d.trail.unshift({ x: d.x, y: d.y });

      var nd = Math.hypot(d.x, d.y);
      if (nd < w.pixelRadius + d.size * 0.55) {
        absorb(w, d);
        w.debris.splice(i, 1);
      } else if (nd > far) {
        w.debris.splice(i, 1);
      }
    }

    for (var j = w.effects.length - 1; j >= 0; j--) {
      var e = w.effects[j];
      e.life += dt;
      if (e.kind === 'spark') {
        var ed = Math.hypot(e.x, e.y) || 1;
        var ea = GM * 0.5 / (ed * ed + 600);
        e.vx += (-e.x / ed) * ea * dt;
        e.vy += (-e.y / ed) * ea * dt;
        e.x += e.vx * dt; e.y += e.vy * dt;
        if (Math.hypot(e.x, e.y) < w.pixelRadius * 0.98) { w.effects.splice(j, 1); continue; }
      }
      if (e.life >= e.dur) w.effects.splice(j, 1);
    }

    return checkMilestones(w);
  };

  /* ---------------- セーブ ---------------- */

  var r3 = function (v) { return Math.round(v * 1000) / 1000; };

  H.serialize = function (w) {
    return {
      v: 2,
      name: w.name,
      mass: w.mass,
      comp: w.comp,
      life: w.life,
      counts: w.counts,
      rotation: w.rotation,
      days: w.days,
      elapsed: w.elapsed,
      unlocked: w.unlocked,
      seenEvent: w.seenEvent,
      log: w.log.slice(-30).map(function (l) { return { day: l.day, title: l.title, text: l.text }; }),
      features: w.features.map(function (f) {
        return { type: f.type, lat: r3(f.lat), lon: r3(f.lon), seed: r3(f.seed), scale: r3(f.scale), hot: !!f.hot };
      }),
      marks: w.marks.slice(-200).map(function (m) {
        return [r3(m.lat), r3(m.lon), r3(m.rm), m.kind];
      })
    };
  };

  /* v1 のセーブを読みかえる(呼び名を変えたので) */
  function migrate(w) {
    var TYPE = { baobab: 'tree', prince: 'keeper' };
    var RETITLE = { 'バオバブの芽': 'sprout', '一輪のバラ': 'rose', '王子さまが来た': 'keeper',
      '夕日を見る椅子': 'bench', '火山が三つ': 'volcano', '街灯と点灯夫': 'lamp' };
    var i, m;
    for (i = 0; i < w.features.length; i++) {
      if (TYPE[w.features[i].type]) w.features[i].type = TYPE[w.features[i].type];
    }
    if (w.unlocked.prince) { delete w.unlocked.prince; w.unlocked.keeper = true; }
    for (i = 0; i < w.log.length; i++) {
      var id = RETITLE[w.log[i].title];
      if (!id) continue;
      for (var k = 0; k < H.MILESTONES.length; k++) {
        m = H.MILESTONES[k];
        if (m.id !== id) continue;
        w.log[i].title = m.title;
        w.log[i].text = m.log;
      }
    }
    if (w.name === 'B-612') w.name = 'N-01';
  }

  H.deserialize = function (data) {
    var w = H.createWorld();
    if (!data || (data.v !== 1 && data.v !== 2)) return w;
    w.fresh = false;
    w.name = typeof data.name === 'string' ? data.name.slice(0, 14) : w.name;
    w.mass = Math.max(H.START_MASS, +data.mass || H.START_MASS);
    if (data.comp) w.comp = { rock: +data.comp.rock || 0, ice: +data.comp.ice || 0, metal: +data.comp.metal || 0 };
    w.life = +data.life || 0;
    if (data.counts) w.counts = { meteor: data.counts.meteor | 0, dust: data.counts.dust | 0,
      wreck: data.counts.wreck | 0, seed: data.counts.seed | 0 };
    w.rotation = +data.rotation || 0;
    w.days = data.days | 0;
    w.elapsed = +data.elapsed || 0;
    w.unlocked = data.unlocked || {};
    w.seenEvent = data.seenEvent || {};
    w.log = (data.log || []).map(function (l) { return { day: l.day | 0, title: l.title, text: l.text }; });
    w.features = (data.features || []).map(function (f) {
      return { type: f.type, lat: +f.lat, lon: +f.lon, seed: +f.seed || 0, scale: +f.scale || 1, hot: !!f.hot };
    });
    w.marks = (data.marks || []).map(function (m) {
      return { lat: +m[0], lon: +m[1], rm: +m[2], kind: m[3] };
    });
    w.radius = H.radiusOf(w.mass);
    if (data.v === 1) migrate(w);
    return w;
  };
})(window.Hakoniwa);
