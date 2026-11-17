// 版ごとの設定 (標準版)。オリジナル版のビルドでは tools/build.mjs が src/variants/original/variant.js に差し替える。
export const VARIANT = {
  id: 'main',
  tag: 'SUZUKA &nbsp;·&nbsp; FUJI &nbsp;·&nbsp; INDY &nbsp;·&nbsp; 1990 F1 &nbsp;·&nbsp; OK-90',   // タイトル画面の小見出し
  storageKey: 'okracing.v1',   // 記録・設定の保存キー
  teams: {},                   // チーム色の上書き { チームid: { c1, c2, c3 } }
  credits: `
        <p><b>Formula simulator</b> — 鈴鹿サーキットを舞台にした見下ろし型F1レーシングシミュレーター。チーム「OK RACING」、マシン「OK-90」および登場するチーム名・ドライバー名はすべて架空のものです。</p>
        <p><b>コースデータ</b><br>コース中心線と幅員: TUMFTM racetrack-database (LGPL-3.0) — https://github.com/TUMFTM/racetrack-database<br>中心線の原データ: © OpenStreetMap contributors (ODbL)<br>全長を 5,807m に正規化し、高低差 (約52m)・立体交差・ピットレーン・縁石・ランオフを追加しています。</p>
        <p><b>富士スピードウェイ</b><br>提供されたコース図 (画像) の線を読み取り、図に記載の全長 4,563m・コーナー半径・標高グラフに合わせて補正した近似形状です。測量データではありません。ピットレーン・縁石・ランオフ・スタンドは本作で追加したものです。</p>
        <p>本作は鈴鹿サーキット、富士スピードウェイ、およびいかなる実在のレース主催者・チームとも関係ありません。</p>`,   // クレジット画面の本文
};
