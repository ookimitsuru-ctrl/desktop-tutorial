/* 星の箱庭 — HUD の更新 */
window.Hakoniwa = window.Hakoniwa || {};
(function (H) {
  'use strict';

  var clamp = H.util.clamp;
  var el = {};
  var cur = null;
  var lastLog = -1;

  function $(id) { return document.getElementById(id); }

  function fmt(n) {
    return Math.round(n).toLocaleString('ja-JP');
  }

  H.ui = {
    init: function (world, handlers) {
      ['starName', 'valRadius', 'valMass', 'valSunsets', 'barRock', 'barIce', 'barMetal',
        'pctRock', 'pctIce', 'pctMetal', 'nextTitle', 'nextNeed', 'barNext', 'logList',
        'cMeteor', 'cDust', 'cWreck', 'cSeed', 'resetBtn', 'speedGroup'].forEach(function (id) {
          el[id] = $(id);
        });

      cur = world;
      el.starName.value = world.name;
      el.starName.addEventListener('input', function () {
        cur.name = el.starName.value.slice(0, 14) || 'N-01';
        handlers.onChange();
      });

      el.speedGroup.addEventListener('click', function (ev) {
        var btn = ev.target.closest('button[data-speed]');
        if (!btn) return;
        var speed = parseFloat(btn.dataset.speed);
        handlers.onSpeed(speed);
        Array.prototype.forEach.call(el.speedGroup.querySelectorAll('button'), function (b) {
          b.classList.toggle('is-on', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
      });

      var armed = false, timer = null;
      el.resetBtn.addEventListener('click', function () {
        if (!armed) {
          armed = true;
          el.resetBtn.textContent = 'ほんとうに?';
          el.resetBtn.classList.add('is-armed');
          timer = setTimeout(function () {
            armed = false;
            el.resetBtn.textContent = '最初から';
            el.resetBtn.classList.remove('is-armed');
          }, 4000);
          return;
        }
        clearTimeout(timer);
        armed = false;
        el.resetBtn.textContent = '最初から';
        el.resetBtn.classList.remove('is-armed');
        handlers.onReset();
      });

      lastLog = -1;
      this.sync(world);
    },

    /* リセット後など、見ている星を差し替える(listener は貼り直さない) */
    attach: function (world) {
      cur = world;
      lastLog = -1;
      if (document.activeElement !== el.starName) el.starName.value = world.name;
      this.sync(world);
    },

    sync: function (w) {
      w = w || cur;
      var f = H.fractions(w);
      el.valRadius.textContent = w.radius.toFixed(2) + ' m';
      el.valMass.textContent = fmt(w.mass) + ' t';
      el.valSunsets.textContent = fmt(w.days) + ' 回';

      var pct = {
        rock: Math.round(f.rock * 100),
        ice: Math.round(f.ice * 100),
        metal: Math.round(f.metal * 100)
      };
      el.barRock.style.width = pct.rock + '%';
      el.barIce.style.width = pct.ice + '%';
      el.barMetal.style.width = pct.metal + '%';
      el.pctRock.textContent = pct.rock + '%';
      el.pctIce.textContent = pct.ice + '%';
      el.pctMetal.textContent = pct.metal + '%';

      el.cMeteor.textContent = fmt(w.counts.meteor);
      el.cDust.textContent = fmt(w.counts.dust);
      el.cWreck.textContent = fmt(w.counts.wreck);
      el.cSeed.textContent = fmt(w.counts.seed);

      var m = H.nextMilestone(w);
      if (!m) {
        el.nextTitle.textContent = '箱庭はひととおり満ちた';
        el.nextNeed.textContent = 'あとは、すきなだけ大きく';
        el.barNext.style.width = '100%';
      } else {
        var prev = H.BASE_RADIUS;
        for (var i = 0; i < H.MILESTONES.length; i++) {
          if (H.MILESTONES[i].id === m.id) break;
          prev = H.MILESTONES[i].r;
        }
        var p = clamp((w.radius - prev) / Math.max(0.01, m.r - prev), 0, 1);
        el.nextTitle.textContent = m.title;
        el.barNext.style.width = (p * 100).toFixed(1) + '%';
        if (p >= 1 && m.need) {
          el.nextNeed.textContent = H.needText(m.need, w);
          el.barNext.classList.add('is-held');
        } else {
          el.nextNeed.textContent = '半径 ' + m.r.toFixed(1) + ' m';
          el.barNext.classList.remove('is-held');
        }
      }

      if (w.log.length !== lastLog) {
        lastLog = w.log.length;
        var html = '';
        var items = w.log.slice(-24);
        for (var k = items.length - 1; k >= 0; k--) {
          var l = items[k];
          html += '<li' + (k === items.length - 1 && l.fresh ? ' class="is-new"' : '') + '>' +
            '<span class="day">' + fmt(l.day) + '日目</span>' +
            '<strong>' + escapeHtml(l.title) + '</strong>' +
            '<p>' + escapeHtml(l.text) + '</p></li>';
          l.fresh = false;
        }
        el.logList.innerHTML = html || '<li class="empty"><p>まだ何も起きていない。降ってくるものを待とう。</p></li>';
      }
    }
  };

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
})(window.Hakoniwa);
