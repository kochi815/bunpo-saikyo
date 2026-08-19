// util.js ― 共通ユーティリティ

const U = {
  // 配列をシャッフル（新しい配列を返す）
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; },
  // n 個を重複なく選ぶ
  sample(arr, n) { return U.shuffle(arr).slice(0, n); },
  // グループごとにバランスよく n 個選ぶ（keyFn でグループ分け）
  balancedSample(arr, n, keyFn) {
    const groups = {};
    for (const x of arr) {
      const k = keyFn(x);
      (groups[k] = groups[k] || []).push(x);
    }
    const keys = U.shuffle(Object.keys(groups));
    for (const k of keys) groups[k] = U.shuffle(groups[k]);
    const out = [];
    let i = 0;
    while (out.length < n) {
      let added = false;
      for (const k of keys) {
        if (groups[k].length > i) { out.push(groups[k][i]); added = true; if (out.length >= n) break; }
      }
      if (!added) break;
      i++;
    }
    return U.shuffle(out);
  },
  esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  },
  // 文字列 → 軽いハッシュ（問題IDに使う）
  hash(str) {
    let h = 5381;
    for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  },
  el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === "class") e.className = attrs[k];
      else if (k === "html") e.innerHTML = attrs[k];
      else if (k === "text") e.textContent = attrs[k];
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), attrs[k]);
      else if (k === "style") e.style.cssText = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    if (children) for (const c of [].concat(children)) {
      if (c == null) continue;
      e.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return e;
  },
  // 「〜だ」→「〜」
  stem(base) { return base.endsWith("だ") ? base.slice(0, -1) : base.endsWith("い") ? base.slice(0, -1) : base; },
  // ルビつきラベル HTML
  ruby(text, kana) {
    if (!kana) return U.esc(text);
    return `<ruby>${U.esc(text)}<rt>${U.esc(kana)}</rt></ruby>`;
  },
  // 数字の全角化など
  pad2(n) { return String(n).padStart(2, "0"); },
  // 「」でくくる
  q(s) { return "「" + s + "」"; },
  // アニメーション用の遅延（Promise）
  wait(ms) { return new Promise(r => setTimeout(r, ms)); }
};
