// メニュー画面 (DOM)
import { SETUPS, TYRES } from './physics.js';
import { WEATHERS, DIFFICULTY, DRIVERS, TEAMS, fmtTime, estimateQualiTime } from './race.js';
import { drawCarShowcase } from './carsprite.js';
import { Store, DEFAULT_SETTINGS } from './storage.js';
import { TRAIN_SECTIONS } from './trainer.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const MODES = {
  free: { name: 'フリー走行', en: 'FREE PRACTICE', desc: '鈴鹿を自由に走行。セッティングやタイヤを試せます。' },
  ta: { name: 'タイムアタック', en: 'TIME ATTACK', desc: 'ベストラップに挑戦。ゴーストと競えます。' },
  train: { name: 'トレーニング', en: 'TRAINING', desc: 'お手本ゴーストと目標ギヤ・速度、トレーナーの助言で区間を繰り返し練習。' },
  quali: { name: '予選', en: 'QUALIFYING', desc: 'アタック3周のベストタイムで決勝グリッドを決定。' },
  race: { name: '決勝', en: 'GRAND PRIX', desc: '20台でのレース。タイヤ摩耗とピット戦略が鍵。' },
};

export class UI {
  constructor(root, actions) {
    this.root = root; this.act = actions; this.screen = null; this.cfg = null; this.ctx = {};
    root.addEventListener('click', ev => this.onClick(ev));
    root.addEventListener('input', ev => this.onInput(ev));
  }
  get visible() { return this.screen != null; }
  hide() { this.screen = null; this.root.innerHTML = ''; this.root.className = ''; }
  show(name, ctx = {}) {
    this.screen = name; this.ctx = ctx;
    this.root.className = 'on scr-' + name;
    this.root.innerHTML = this[name](ctx);
    this.after?.[name]?.call(this, ctx);
    const me = this.root.querySelector('tr.me'); if (me && me.scrollIntoView) me.scrollIntoView({ block: 'center' });
    const cv = this.root.querySelector('canvas.showcase');
    if (cv) { const dpr = Math.min(3, window.devicePixelRatio || 1); cv.width = cv.clientWidth * dpr; cv.height = cv.clientHeight * dpr; drawCarShowcase(cv, TEAMS[0], 1); }
  }
  refresh() { if (this.screen) { const sc = this.root.querySelector('.scroll'); const top = sc ? sc.scrollTop : 0; this.show(this.screen, this.ctx); const s2 = this.root.querySelector('.scroll'); if (s2) s2.scrollTop = top; } }

  onClick(ev) {
    const t = ev.target.closest('[data-act],[data-set],[data-opt]'); if (!t) return;
    this.act.click?.();
    if (t.dataset.act) { this.act[t.dataset.act]?.(t.dataset.arg, this.ctx); return; }
    if (t.dataset.set) { // 設定値
      const s = Store.settings(); let v = t.dataset.val;
      if (v === 'true') v = true; else if (v === 'false') v = false; else if (!isNaN(Number(v)) && v !== '') v = Number(v);
      s[t.dataset.set] = v; Store.saveSettings(s); this.act.settingsChanged?.(s); this.refresh(); return;
    }
    if (t.dataset.opt) { // セッション設定
      const l = Store.last(); let v = t.dataset.val; if (!isNaN(Number(v)) && v !== '') v = Number(v);
      l[t.dataset.opt] = v; Store.saveLast(l); this.act.optionChanged?.(t.dataset.opt, v, this.ctx); this.refresh();
    }
  }
  onInput(ev) {
    const t = ev.target; if (!t.dataset.range) return;
    const s = Store.settings(); s[t.dataset.range] = Number(t.value); Store.saveSettings(s); this.act.settingsChanged?.(s);
    const o = this.root.querySelector(`[data-out="${t.dataset.range}"]`); if (o) o.textContent = this.fmtRange(t.dataset.range, Number(t.value));
  }
  fmtRange(k, v) { return k === 'volume' ? `${Math.round(v * 100)}%` : `${Math.round(v * 100)}%`; }

  seg(kind, key, cur, opts) {
    return `<div class="seg">${opts.map(o => `<button class="${o.v === cur ? 'sel' : ''}" data-${kind}="${key}" data-val="${o.v}">${o.dot ? `<i class="dot" style="border-color:${o.dot}">${o.short}</i>` : ''}<b>${esc(o.label)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</button>`).join('')}</div>`;
  }

  // ---------------- 画面 ----------------
  title() {
    return `<div class="title">
      <div class="logo"><span class="ok">OK</span><span class="racing">RACING</span></div>
      <div class="tag">SUZUKA CIRCUIT &nbsp;·&nbsp; F1 SIMULATOR &nbsp;·&nbsp; OK-90</div>
      <canvas class="showcase"></canvas>
      <button class="big" data-act="start">TAP TO START</button>
      <div class="foot">操作はアクセル・ブレーキ・シフトだけ — ステアリングは自動</div>
    </div>`;
  }
  menu() {
    const bd = Store.bestLap(false), bw = Store.bestLap(true), q = Store.quali();
    const card = id => `<button class="card" data-act="mode" data-arg="${id}"><em>${MODES[id].en}</em><b>${MODES[id].name}</b><span>${MODES[id].desc}</span></button>`;
    return `<div class="panel wide">
      <header><div class="logo sm"><span class="ok">OK</span><span class="racing">RACING</span></div>
        <div class="best">ベストラップ <b>${fmtTime(bd?.time)}</b>${bw ? ` &nbsp; ウェット <b>${fmtTime(bw.time)}</b>` : ''}${q ? ` &nbsp; 予選 <b>P${q.pos}</b>` : ''}</div></header>
      <div class="cards">${card('free')}${card('train')}${card('ta')}${card('quali')}${card('race')}</div>
      <footer><button data-act="open" data-arg="settings">設定</button><button data-act="open" data-arg="howto">操作説明</button><button data-act="open" data-arg="records">記録</button><button data-act="open" data-arg="credits">クレジット</button></footer>
    </div>`;
  }
  config({ mode }) {
    const l = Store.last(), s = Store.settings(), q = Store.quali();
    const setups = Object.values(SETUPS).map(x => ({ v: x.id, label: x.name, sub: x.desc }));
    const tyres = Object.values(TYRES).map(x => ({ v: x.id, label: x.name, dot: x.color, short: x.short, sub: { soft: '高グリップ・摩耗早い', medium: 'バランス型', hard: '長持ち・グリップ控えめ', rain: '雨天用' }[x.id] }));
    const weathers = Object.entries(WEATHERS).filter(([k]) => mode !== 'train' || k !== 'change').map(([k, w]) => ({ v: k, label: w.name }));
    let extra = '';
    if (mode === 'train') extra = this.trainOptions(l, s);
    if (mode === 'race') {
      const gridOpts = [{ v: 'quali', label: '予選結果', sub: q ? `P${q.pos} スタート` : '未実施 (10番手)' }, { v: 'pole', label: 'ポール' }, { v: 'mid', label: '10番手' }, { v: 'last', label: '最後尾' }];
      extra = `<h3>周回数</h3>${this.seg('opt', 'laps', l.laps, [5, 10, 20, 53].map(n => ({ v: n, label: `${n}周`, sub: n === 53 ? 'フルディスタンス' : `約${Math.round(n * 1.75)}分` })))}
        <h3>スターティンググリッド</h3>${this.seg('opt', 'gridMode', l.gridMode, gridOpts)}`;
    }
    const diff = (mode === 'race' || mode === 'quali') ? `<h3>ライバルの強さ</h3>${this.seg('set', 'difficulty', s.difficulty, Object.entries(DIFFICULTY).map(([k, d]) => ({ v: k, label: d.name })))}` : '';
    return `<div class="panel wide">
      <header><button class="back" data-act="back">‹ 戻る</button><h2>${MODES[mode].name}<em>${MODES[mode].en}</em></h2><button class="go" data-act="go" data-arg="${mode}">スタート ›</button></header>
      <div class="scroll">
        <h3>セッティング</h3>${this.seg('opt', 'setup', l.setup, setups)}
        <h3>タイヤ</h3>${this.seg('opt', 'tyre', l.tyre, tyres)}
        <h3>天候</h3>${this.seg('opt', 'weather', l.weather, weathers)}
        ${extra}${diff}
        <h3>ドライビングアシスト</h3>
        ${this.seg('set', 'assist', s.assist, [{ v: false, label: 'なし (標準)', sub: 'ABS・TCS 無しの1990年仕様' }, { v: true, label: 'あり', sub: 'ホイールロックと空転を抑える' }])}
        ${this.seg('set', 'autoShift', s.autoShift, [{ v: false, label: 'マニュアル (標準)', sub: 'パドルで6速を操作' }, { v: true, label: 'オートマチック', sub: '自動変速' }])}
      </div></div>`;
  }
  settings({ inGame } = {}) {
    const s = Store.settings();
    const range = (k, min, max, step) => `<div class="range"><input type="range" min="${min}" max="${max}" step="${step}" value="${s[k]}" data-range="${k}"><output data-out="${k}">${this.fmtRange(k, s[k])}</output></div>`;
    return `<div class="panel wide">
      <header><button class="back" data-act="${inGame ? 'pauseBack' : 'back'}">‹ 戻る</button><h2>設定<em>SETTINGS</em></h2><span></span></header>
      <div class="scroll">
        <div class="note">ステアリングは端末が自動で行います。操作するのはアクセル・ブレーキ・シフトだけです。</div>
        <h3>ペダルパッド (左下)</h3>
        ${this.seg('set', 'pedalSwap', s.pedalSwap, [{ v: false, label: '左 アクセル / 右 ブレーキ (標準)', sub: '中央から離すほど強くなる' }, { v: true, label: '左 ブレーキ / 右 アクセル' }])}
        <h3>指を離したとき</h3>
        ${this.seg('set', 'pedalRelease', s.pedalRelease, [{ v: 'zero', label: 'ゼロに戻す (標準)' }, { v: 'hold', label: '直前の入力を保持' }])}
        <h3>カメラ</h3>
        ${this.seg('set', 'camera', s.camera, [{ v: 'up', label: '進行方向が上' }, { v: 'right', label: '進行方向が右', sub: '先が広く見える' }, { v: 'north', label: '北が上 (固定)' }])}
        ${this.seg('set', 'zoom', s.zoom, [{ v: 'near', label: '近い' }, { v: 'normal', label: '標準' }, { v: 'far', label: '遠い' }])}
        <h3>表示</h3>
        ${this.seg('set', 'lineAssist', s.lineAssist, [{ v: true, label: '走行ライン表示 ON', sub: '赤=ブレーキ 黄=旋回' }, { v: false, label: 'OFF' }])}
        ${this.seg('set', 'ghost', s.ghost, [{ v: true, label: 'ゴースト ON' }, { v: false, label: 'OFF' }])}
        ${this.seg('set', 'quality', s.quality, [{ v: 'auto', label: '画質 自動', sub: '60fpsを保つよう調整' }, { v: 'high', label: '高画質' }, { v: 'low', label: '軽量' }])}
        <h3>ダメージ</h3>${this.seg('set', 'damage', s.damage, [{ v: true, label: 'あり' }, { v: false, label: 'なし' }])}
        <h3>音量</h3>${range('volume', 0, 1, 0.05)}
        <div class="row"><button data-act="resetSettings">設定を初期化</button></div>
      </div></div>`;
  }
  howto() {
    return `<div class="panel wide">
      <header><button class="back" data-act="back">‹ 戻る</button><h2>操作説明<em>HOW TO DRIVE</em></h2><span></span></header>
      <div class="scroll howto">
        <div class="how"><b class="k str">AUTO</b><p><strong>ステアリングは自動</strong><br>ハンドル操作はありません。マシンは理想の走行ラインを自動でたどり、前の車に追いつくと空いている側へ自動で並びかけます。速く走れるか・抜けるかは、アクセルとブレーキのタイミング次第です。</p></div>
        <div class="how"><b class="k acc">ACCEL</b><p><strong>アクセル (左下パッドの左半分)</strong><br>パッドの中央がニュートラル。中央から左へスライドするほど開度が上がります (0〜100%)。低いギアで全開にすると後輪が空転します。じわっと開けるのがコツ。</p></div>
        <div class="how"><b class="k brk">BRAKE</b><p><strong>ブレーキ (左下パッドの右半分)</strong><br>中央から右へスライドするほど強く効きます。ABSは無いので、速度が落ちてダウンフォースが減ったら踏力を抜かないとタイヤがロックします。速度が高すぎるとコーナーを曲がり切れません。</p></div>
        <div class="how"><b class="k pad">▼ ▲</b><p><strong>6速パドルシフト (右下)</strong><br>左が DOWN、右が UP。回転ランプが青く点滅したらシフトアップ。回転が高すぎるシフトダウンは受け付けません。停止中に1速から DOWN でリバース。</p></div>
        <div class="how"><b class="k line">PASS</b><p><strong>追い越し</strong><br>コーナーの立ち上がりで早くアクセルを開けて直線で並ぶ、スリップストリームに入る、ブレーキングを遅らせてインに飛び込む — タイミングが良ければ抜けます。</p></div>
        <div class="how"><b class="k tr">TRAIN</b><p><strong>トレーニングモード</strong><br>練習したい区間を選ぶと、その少し手前からお手本と同じ速度でスタート。半透明の<span style="color:#7fd6ff">お手本ゴースト</span>が理想のラインと速度で先行し、左の<strong>目標パネル</strong>に、いまの位置でのお手本の速度と<strong>最適ギヤ</strong>が大きく出ます。トレーナーがブレーキ開始点やアクセルのタイミングをその場で声かけし、区間を走り終えるとお手本との差(★1〜5)と改善点を講評。「自動リピート」で何度でも続けて挑戦できます。</p></div>
        <div class="how"><b class="k pit">PIT</b><p><strong>ピットイン</strong><br>左上の PIT を押して次のタイヤを選び、最終コーナーで右側へ。ピットレーン内は自動走行でタイヤ交換と修理を行います。</p></div>
        <div class="how"><b class="k line">LINE</b><p><strong>走行ライン</strong><br>路面のラインは理想の走行ライン。<span style="color:#ff5a4a">赤</span>はブレーキング、<span style="color:#ffd23a">黄</span>は旋回区間の目安です。</p></div>
        <div class="how"><b class="k key">KEY</b><p><strong>キーボード (PC)</strong><br>↑ アクセル / ↓ ブレーキ / → シフトアップ / ← シフトダウン (X / Z でも可) / P ポーズ / R コース復帰 / I ピット / C カメラ切替。ゲームパッドにも対応。</p></div>
      </div></div>`;
  }
  records() {
    const R = Store.records();
    const tname = id => TYRES[id]?.name || '-', sname = id => SETUPS[id]?.name || '-';
    const laps = R.laps.slice(0, 12).map((r, i) => `<tr><td>${i + 1}</td><td class="t">${fmtTime(r.time)}</td><td>${tname(r.tyre)}</td><td>${sname(r.setup)}</td><td>${r.wet ? 'ウェット' : 'ドライ'}</td><td>${esc(r.mode || '')}</td><td>${esc(r.date || '')}</td></tr>`).join('') || '<tr><td colspan="7" class="empty">まだ記録がありません</td></tr>';
    const sec = cls => (R.sectors[cls] || [null, null, null]).map(v => v == null ? '--.---' : v.toFixed(3)).join(' / ');
    const races = R.races.map(r => `<tr><td>${esc(r.date)}</td><td>${r.laps}周</td><td>${esc(WEATHERS[r.weather]?.name || '')}</td><td>${r.grid}番手 → <b>${r.dnf ? 'リタイア' : r.pos + '位'}</b></td><td class="t">${fmtTime(r.best)}</td></tr>`).join('') || '<tr><td colspan="5" class="empty">まだ決勝の記録がありません</td></tr>';
    return `<div class="panel wide">
      <header><button class="back" data-act="back">‹ 戻る</button><h2>記録<em>RECORDS</em></h2><button data-act="clearRecords">記録を消去</button></header>
      <div class="scroll">
        <h3>ベストラップ</h3><table class="tbl"><tr><th>#</th><th>タイム</th><th>タイヤ</th><th>セッティング</th><th>路面</th><th>モード</th><th>日付</th></tr>${laps}</table>
        <h3>セクターベスト <small>ドライ: ${sec('dry')} &nbsp; ウェット: ${sec('wet')}</small></h3>
        <h3>決勝リザルト</h3><table class="tbl"><tr><th>日付</th><th>距離</th><th>天候</th><th>結果</th><th>ベスト</th></tr>${races}</table>
      </div></div>`;
  }
  credits() {
    return `<div class="panel wide">
      <header><button class="back" data-act="back">‹ 戻る</button><h2>クレジット<em>CREDITS</em></h2><span></span></header>
      <div class="scroll credits">
        <p><b>OK RACING</b> — 鈴鹿サーキットを舞台にした見下ろし型F1レーシングシミュレーター。チーム「OK RACING」、マシン「OK-90」および登場するチーム名・ドライバー名はすべて架空のものです。</p>
        <p><b>コースデータ</b><br>コース中心線と幅員: TUMFTM racetrack-database (LGPL-3.0) — https://github.com/TUMFTM/racetrack-database<br>中心線の原データ: © OpenStreetMap contributors (ODbL)<br>全長を 5,807m に正規化し、高低差 (約52m)・立体交差・ピットレーン・縁石・ランオフを追加しています。</p>
        <p>本作は鈴鹿サーキットおよびいかなる実在のレース主催者・チームとも関係ありません。</p>
      </div></div>`;
  }
  pause({ mode }) {
    const s = Store.settings(), l = Store.last();
    let free = '';
    if (mode === 'train') free = this.trainOptions(l, s, true);
    if (mode === 'free' || mode === 'train') {
      free += `<h3>セッティング変更</h3>${this.seg('opt', 'setup', l.setup, Object.values(SETUPS).map(x => ({ v: x.id, label: x.name })))}
      <h3>タイヤ交換</h3>${this.seg('opt', 'tyre', l.tyre, Object.values(TYRES).map(x => ({ v: x.id, label: x.name, dot: x.color, short: x.short })))}
      <h3>天候</h3>${this.seg('opt', 'weather', l.weather, Object.entries(WEATHERS).filter(([k]) => k !== 'change').map(([k, w]) => ({ v: k, label: w.name })))}`;
    }
    return `<div class="panel">
      <header><h2>ポーズ<em>PAUSED</em></h2></header>
      <div class="scroll">
        <div class="btns"><button class="go" data-act="resume">再開</button><button data-act="restart">リスタート</button><button data-act="open" data-arg="settingsInGame">設定</button><button data-act="quit">メニューへ戻る</button></div>
        ${free}
        <h3>カメラ</h3>${this.seg('set', 'camera', s.camera, [{ v: 'up', label: '進行方向が上' }, { v: 'right', label: '進行方向が右' }, { v: 'north', label: '北が上' }])}
      </div></div>`;
  }
  results({ session }) {
    const S = session, mode = S.mode; let body = '', head = '', next = '';
    if (mode === 'race') {
      const lead = S.results[0];
      head = `<tr><th>順位</th><th>No.</th><th>ドライバー</th><th>チーム</th><th>周回</th><th>タイム / 差</th><th>ベスト</th><th>PIT</th></tr>`;
      body = S.results.map(r => {
        let tm;
        if (r.dnf) tm = 'リタイア'; else if (r.time == null) tm = '走行中'; else if (r === lead) tm = fmtTime(r.time);
        else if (r.laps < lead.laps) tm = `+${lead.laps - r.laps}周`; else tm = `+${(r.time - lead.time).toFixed(3)}`;
        return `<tr class="${r.player ? 'me' : ''}"><td>${r.dnf ? '-' : r.pos}</td><td>${r.no}</td><td>${esc(r.name)}${r.penalty ? ' <small>(+' + r.penalty + '秒)</small>' : ''}</td><td>${esc(r.team)}</td><td>${r.laps}</td><td class="t">${tm}</td><td class="t">${fmtTime(r.best)}</td><td>${r.stops}</td></tr>`;
      }).join('');
    } else if (mode === 'quali') {
      const pole = S.results[0].best;
      head = `<tr><th>順位</th><th>No.</th><th>ドライバー</th><th>チーム</th><th>タイム</th><th>差</th></tr>`;
      body = S.results.map(r => `<tr class="${r.player ? 'me' : ''}"><td>${r.pos}</td><td>${r.no}</td><td>${esc(r.name)}</td><td>${esc(r.team)}</td><td class="t">${r.best == null ? 'ノータイム' : fmtTime(r.best)}</td><td class="t">${r.best == null || r.pos === 1 ? '' : '+' + (r.best - pole).toFixed(3)}</td></tr>`).join('');
      next = `<button class="go" data-act="toRace">決勝へ進む ›</button>`;
    }
    const me = S.results.find(r => r.player);
    const title = mode === 'race' ? (me.dnf ? 'リタイア' : `${me.pos}位 フィニッシュ`) : `予選 ${me.pos}番手`;
    return `<div class="panel wide">
      <header><h2>${title}<em>${mode === 'race' ? 'RACE RESULT' : 'QUALIFYING RESULT'}</em></h2><div class="btns inline">${next}<button data-act="restart">もう一度</button><button data-act="quit">メニューへ</button></div></header>
      <div class="scroll"><table class="tbl res">${head}${body}</table></div></div>`;
  }
  // トレーニングの設定 (区間・ガイド・ゴースト・リピート)
  trainOptions(l, s, compact) {
    const B = Store.trainBest();
    const secs = TRAIN_SECTIONS.map((x, k) => ({ v: k, label: x.name, sub: B[x.id] ? `ベスト ${'★'.repeat(B[x.id].stars)}${'☆'.repeat(5 - B[x.id].stars)}` : '未挑戦' }));
    return `<h3>練習する区間 <small>お手本の少し手前から、同じ速度でスタートします</small></h3><div class="secs">${this.seg('opt', 'trainSec', l.trainSec, secs)}</div>
      <h3>トレーニング補助</h3>
      ${this.seg('set', 'trainGuide', s.trainGuide, [{ v: true, label: 'ガイド ON', sub: '目標速度・最適ギヤ・トレーナーの声かけ' }, { v: false, label: 'ガイド OFF', sub: 'ゴーストだけで練習' }])}
      ${this.seg('set', 'ghost', s.ghost, [{ v: true, label: 'お手本ゴースト ON' }, { v: false, label: 'OFF' }])}
      ${this.seg('set', 'trainAuto', s.trainAuto, [{ v: true, label: '自動リピート ON', sub: '講評のあと数秒で自動でやり直し' }, { v: false, label: 'OFF', sub: '「もう一度」を押すまで待つ' }])}`;
  }
  trainPick() {
    const l = Store.last(), s = Store.settings();
    return `<div class="panel wide">
      <header><button class="back" data-act="trainBackReview">‹ 戻る</button><h2>区間を選ぶ<em>TRAINING</em></h2><button class="go" data-act="trainGo">この区間で練習 ›</button></header>
      <div class="scroll">${this.trainOptions(l, s)}</div></div>`;
  }
  trainReview({ report: r, auto }) {
    const star = n => `<span class="stars">${'★'.repeat(n)}<i>${'★'.repeat(5 - n)}</i></span>`;
    const dtxt = d => `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(2)}秒`;
    const adv = r.advice.map(a => `<li class="${a.sev}">${esc(a.text)}</li>`).join('');
    let table = '';
    if (r.aborted) table = '';
    else if (r.isLap) {
      table = `<table class="tbl"><tr><th>区間</th><th>評価</th><th>お手本との差</th></tr>${r.rows.map(x => `<tr><td>${esc(x.name)}</td><td>${star(x.stars)}</td><td class="t ${x.dT > 0.4 ? 'bad' : 'ok'}">${dtxt(x.dT)}</td></tr>`).join('')}</table>`;
    } else {
      const z = r.zones.map(q => {
        const bm = Math.round(q.brakeDiffM), em = Math.round(q.exitDiffM);
        const cls = (v, th) => (Math.abs(v) <= th ? 'ok' : 'bad');
        return `<tr><td>${esc(q.label)}</td><td class="${q.noBrake ? 'bad' : cls(bm, 12)}">${q.noBrake ? 'なし' : (bm > 0 ? `${bm}m 遅い` : bm < 0 ? `${-bm}m 早い` : '一致')}</td><td class="${q.vMinPl < q.vMinRef - 8 ? 'bad' : 'ok'}">${Math.round(q.vMinPl)} <small>/ ${Math.round(q.vMinRef)}</small></td><td class="${cls(em, 14)}">${em > 0 ? `${em}m 遅い` : em < 0 ? `${-em}m 早い` : '一致'}</td><td class="${q.gearPl && q.gearPl !== q.gearOpt ? 'bad' : 'ok'}">${q.gearPl || '-'} <small>/ ${q.gearOpt}</small></td></tr>`;
      }).join('');
      table = z ? `<table class="tbl"><tr><th>ブレーキング</th><th>踏み始め</th><th>最低速度 <small>あなた/お手本 km/h</small></th><th>アクセル開始</th><th>ギヤ <small>あなた/最適</small></th></tr>${z}</table>` : '';
    }
    const head = r.aborted ? '中断' : `${star(r.stars)} <b class="${r.delta > 0.4 ? 'bad' : 'ok'}">${dtxt(r.delta)}</b> <small>お手本との差</small> <span class="score">${r.score}点</span>`;
    return `<div class="panel wide">
      <header><h2>${esc(r.name)}<em>${r.run}回目</em></h2><div class="btns inline"><button class="go" data-act="trainRetry">↻ もう一度</button><button data-act="trainNext">次の区間 ›</button><button data-act="open" data-arg="trainPick">区間を選ぶ</button><button data-act="quit">終了</button></div></header>
      <div class="scroll">
        <div class="trsum">${head}</div>
        ${auto ? '<div class="autoline"><span id="autoRow">自動リピート: <b id="autoCnt"></b>秒後にもう一度</span> <button data-act="trainStopAuto">止める</button></div>' : ''}
        <div class="coach"><div class="av">T</div><ul>${adv}</ul></div>
        ${table}
      </div></div>`;
  }
  notice({ text, sub }) {
    return `<div class="panel small"><h2>${esc(text)}</h2><p>${esc(sub || '')}</p><div class="btns"><button class="go" data-act="noticeOk">OK</button></div></div>`;
  }
}
export { MODES };
