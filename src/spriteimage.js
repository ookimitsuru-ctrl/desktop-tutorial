// 毎フレーム drawImage するスプライトは、canvas のままではなくデコード済みの Image にしておく。
// Android WebView では canvas (OffscreenCanvas / ImageBitmap も同様) を drawImage の元にすると
// 合成で 1 フレーム 12〜20ms 止まることがある。変換は非同期なので、終わるまでは canvas のまま描く。
export function swapToImage(cv, set) {
  if (typeof Image === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return;
  const blobP = cv.convertToBlob ? cv.convertToBlob({ type: 'image/png' })
    : cv.toBlob ? new Promise(res => cv.toBlob(res, 'image/png')) : null;
  if (!blobP) return;
  blobP.then(blob => {
    if (!blob) return;
    const url = URL.createObjectURL(blob), img = new Image();
    img.onload = () => {
      const done = () => { URL.revokeObjectURL(url); set(img); };
      if (img.decode) img.decode().then(done, done); else done();
    };
    img.onerror = () => URL.revokeObjectURL(url); // 失敗したら canvas のまま (遅いが正しく描ける)
    img.src = url;
  }).catch(() => {});
}
