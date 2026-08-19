// ui.js ― 画面の描画（DOM を組み立てるだけ。進行のロジックは game.js）

const UI = {
  root: null,

  init() { this.root = document.getElementById("app"); },

  mount(node) {
    this.root.innerHTML = "";
    this.root.appendChild(node);
    window.scrollTo(0, 0);
  },

  // 品詞・成分ラベル（ルビつき）
  label(key, withRuby) {
    const info = labelInfo(key);
    const useRuby = withRuby !== false && Storage.data.settings.ruby && info.kana && !key.includes("・") && key !== "名詞＋だ";
    return useRuby ? U.ruby(key, info.kana) : U.esc(key);
  },

  posTag(key) {
    const info = labelInfo(key);
    return `<span class="pos-tag" style="background:${info.color}">${U.esc(key)}</span>`;
  },

  topbar(opts) {
    const bar = U.el("div", { class: "topbar" });
    if (opts.back) bar.appendChild(U.el("button", { class: "icon-btn", title: "もどる", onclick: opts.back }, "←"));
    bar.appendChild(U.el("div", { class: "title", html: opts.title || "" }));
    if (opts.right) for (const r of [].concat(opts.right)) bar.appendChild(r);
    return bar;
  },

  toast(msg, ms) {
    const root = document.getElementById("toast-root");
    root.innerHTML = "";
    const t = U.el("div", { class: "toast", text: msg });
    root.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, ms || 1800);
  },

  // ---------- モーダル ----------
  modal(contentNode, opts) {
    opts = opts || {};
    const rootEl = document.getElementById("modal-root");
    const bg = U.el("div", { class: "modal-bg" });
    const box = U.el("div", { class: "modal" });
    box.appendChild(contentNode);
    bg.appendChild(box);
    const close = () => { bg.remove(); if (opts.onClose) opts.onClose(); };
    bg.addEventListener("click", e => { if (e.target === bg && opts.dismissable !== false) close(); });
    rootEl.appendChild(bg);
    return close;
  },

  confirm(message, onYes, opts) {
    opts = opts || {};
    const wrap = U.el("div");
    wrap.appendChild(U.el("div", { class: "md-plain", text: message }));
    const actions = U.el("div", { class: "md-actions" });
    let close;
    actions.appendChild(U.el("button", { class: "btn btn-ghost btn-sm", onclick: () => close() }, opts.no || "やめる"));
    actions.appendChild(U.el("button", { class: "btn " + (opts.danger ? "btn-accent" : "btn-primary") + " btn-sm", onclick: () => { close(); onYes(); } }, opts.yes || "はい"));
    wrap.appendChild(actions);
    close = this.modal(wrap);
  },

  // ことばカードの詳細
  cardDetail(key) {
    const info = POS[key] || EXTRA_CARDS.find(c => c.key === key) || (ROLE[key] ? Object.assign({}, EXTRA_CARDS[1]) : null);
    if (!info) return;
    const color = info.color, light = info.light;
    const wrap = U.el("div");
    const head = U.el("div", { class: "md-head", style: `background:${color}` });
    head.appendChild(U.el("div", { html: `${U.esc(info.key)}<span class="md-kana">${U.esc(info.kana || "")}</span>` }));
    let close;
    head.appendChild(U.el("button", { class: "md-close", onclick: () => close() }, "×"));
    wrap.appendChild(head);
    const body = U.el("div", { class: "md-body" });
    if (info.group) body.appendChild(U.el("div", { class: "tag", text: info.group }));
    body.appendChild(U.el("p", { style: "margin:8px 0 0;font-weight:700", text: info.def }));
    if (info.tests) {
      body.appendChild(U.el("h4", { text: "見分け方" }));
      const ul = U.el("ul");
      info.tests.forEach(t => ul.appendChild(U.el("li", { text: t })));
      body.appendChild(ul);
    }
    if (info.ex) {
      body.appendChild(U.el("h4", { text: "例" }));
      const ex = U.el("div", { class: "md-ex" });
      info.ex.forEach(e => ex.appendChild(U.el("span", { text: e, style: `background:${light}` })));
      body.appendChild(ex);
    }
    if (info.note) body.appendChild(U.el("div", { class: "md-note", html: "💡 " + U.esc(info.note) }));
    wrap.appendChild(body);
    Storage.data.cards[key] = true; Storage.save();
    close = this.modal(wrap);
  },

  // 今回のポイント（プレイ中に見返す）
  pointModal(stage) {
    const wrap = U.el("div");
    const head = U.el("div", { class: "md-head", style: `background:${stage.chapter.color}` });
    head.appendChild(U.el("div", { html: `📌 今回のポイント <span class="md-kana">${U.esc(stage.id)} ${U.esc(stage.title)}</span>` }));
    let close;
    head.appendChild(U.el("button", { class: "md-close", onclick: () => close() }, "×"));
    wrap.appendChild(head);
    const body = U.el("div", { class: "md-body" });
    const ul = U.el("ul");
    stage.point.forEach(p => ul.appendChild(U.el("li", { text: p })));
    body.appendChild(ul);
    if (stage.learn && stage.learn.length) {
      const mc = U.el("div", { class: "mini-cards" });
      stage.learn.forEach(k => {
        const info = POS[k] || EXTRA_CARDS.find(c => c.key === k);
        if (info) mc.appendChild(U.el("button", { class: "mini-card", style: `border-color:${info.color};color:${info.color}`, onclick: () => UI.cardDetail(k) }, "📖 " + k));
      });
      body.appendChild(mc);
    }
    wrap.appendChild(body);
    close = this.modal(wrap);
  },

  // 設定
  settings(onChange) {
    const st = Storage.data.settings;
    const wrap = U.el("div");
    const head = U.el("div", { class: "md-head", style: "background:#475569" });
    head.appendChild(U.el("div", { text: "⚙ 設定" }));
    let close;
    head.appendChild(U.el("button", { class: "md-close", onclick: () => close() }, "×"));
    wrap.appendChild(head);
    const body = U.el("div", { class: "md-body" });
    const apply = (key, val) => {
      st[key] = val; Storage.save();
      if (key === "sound") Sound.setSE(val);
      else if (key === "bgm") Sound.setBGM(val);
      else if (key === "bgmSet") Sound.setBGMSet(val);
      else if (key === "bgmVolume") Sound.setBGMVolume(val);
      if (onChange) onChange(key, val);
    };
    const row = (title, desc, key) => {
      const r = U.el("div", { class: "setting-row" });
      r.appendChild(U.el("div", { html: `<div style="font-weight:700">${U.esc(title)}</div><div class="s-desc">${U.esc(desc)}</div>` }));
      const t = U.el("button", { class: "toggle" + (st[key] ? " on" : ""), onclick: () => { apply(key, !st[key]); t.classList.toggle("on", st[key]); } });
      r.appendChild(t);
      body.appendChild(r);
    };
    row("BGM（音楽）", "画面ごとに静かな音楽を流す", "bgm");
    // BGM の種類
    const setRow = U.el("div", { class: "setting-row" });
    setRow.appendChild(U.el("div", { html: `<div style="font-weight:700">BGMの種類</div><div class="s-desc">スタンダード／ポケモン風（九九最強王と同じ曲）</div>` }));
    const seg = U.el("div", { class: "seg" });
    const segBtns = {};
    Object.keys(Sound.bgmSets).forEach(k => {
      const b = U.el("button", { class: "seg-btn" + (st.bgmSet === k ? " on" : ""), text: Sound.bgmSets[k].label, onclick: () => { apply("bgmSet", k); for (const kk in segBtns) segBtns[kk].classList.toggle("on", kk === k); } });
      segBtns[k] = b; seg.appendChild(b);
    });
    setRow.appendChild(seg);
    body.appendChild(setRow);
    // 音量
    const volRow = U.el("div", { class: "setting-row" });
    volRow.appendChild(U.el("div", { html: `<div style="font-weight:700">BGMの音量</div><div class="s-desc">小さめがおすすめ</div>` }));
    const vol = U.el("input", { type: "range", min: "0", max: "100", value: String(Math.round((st.bgmVolume == null ? 0.4 : st.bgmVolume) * 100)), class: "vol" });
    vol.addEventListener("input", () => apply("bgmVolume", Number(vol.value) / 100));
    volRow.appendChild(vol);
    body.appendChild(volRow);
    row("効果音", "正解・不正解のときの音", "sound");
    row("ふりがな", "品詞の名前にふりがなをつける", "ruby");
    row("ぜんぶのステージをひらく", "順番に関係なく、好きなステージで遊べる（保護者用）", "unlockAll");
    const stats = Storage.data.stats;
    body.appendChild(U.el("div", { class: "small muted", style: "margin-top:12px", text: `これまでに答えた問題：${stats.answered}問（正解 ${stats.correct}問）` }));
    const resetBtn = U.el("button", { class: "btn btn-ghost btn-sm", style: "margin-top:12px;color:#b91c1c", onclick: () => {
      UI.confirm("記録（星・にがて問題）をぜんぶ消します。本当にいい？", () => { Storage.reset(); Sound.init(Storage.data.settings); close(); Game.home(); UI.toast("記録を消しました"); }, { yes: "消す", danger: true });
    } }, "記録をリセットする");
    body.appendChild(resetBtn);
    wrap.appendChild(body);
    close = this.modal(wrap);
  },

  confetti() {
    const colors = ["#ff9f43", "#4f6df5", "#22c55e", "#ec4899", "#facc15", "#0ea5e9"];
    for (let i = 0; i < 40; i++) {
      const p = U.el("div", { class: "confetti-piece", style: `left:${Math.random() * 100}vw;background:${U.pick(colors)};animation-delay:${Math.random() * 0.8}s;transform:rotate(${Math.random() * 360}deg)` });
      document.body.appendChild(p);
      setTimeout(() => p.remove(), 3600);
    }
  },

  starsHtml(n, max) {
    let s = "";
    for (let i = 0; i < (max || 3); i++) s += i < n ? "★" : '<span class="off">★</span>';
    return s;
  },

  // ---------- ホーム ----------
  home() {
    const stars = Storage.totalStars();
    const rank = rankFor(stars);
    const cleared = STAGE_LIST.filter(s => Storage.stage(s.id) && Storage.stage(s.id).cleared).length;
    const next = Game.nextStage();
    const weakN = Storage.weakIds().length;
    const scr = U.el("div", { class: "screen" });
    const tools = U.el("div", { class: "home-tools" });
    const bgmBtn = U.el("button", { class: "icon-btn", title: "BGM オン／オフ", onclick: () => {
      const st = Storage.data.settings; st.bgm = !st.bgm; Storage.save(); Sound.setBGM(st.bgm);
      bgmBtn.textContent = st.bgm ? "🔊 BGM" : "🔇 BGM"; UI.toast(st.bgm ? "BGM オン" : "BGM オフ", 1200);
    } }, Storage.data.settings.bgm ? "🔊 BGM" : "🔇 BGM");
    tools.appendChild(bgmBtn);
    tools.appendChild(U.el("button", { class: "icon-btn", title: "設定", onclick: () => UI.settings((k) => { if (k === "ruby" || k === "unlockAll") Game.home(); }) }, "⚙️"));
    scr.appendChild(tools);
    scr.appendChild(U.el("div", { class: "home-hero", html: `
      <div class="home-logo"><span class="crown">👑</span>文法最強王</div>
      <div class="home-sub">ことばの働きを、見分け方から身につけよう</div>
      <div class="rank-box"><span class="rank-icon">${rank.icon}</span><span><div class="rank-name">${U.esc(rank.name)}</div><div class="rank-stars">★ ${stars} / ${STAGE_LIST.length * 3}</div></span></div>
      <div class="small muted" style="margin-top:8px">クリアしたステージ：${cleared} / ${STAGE_LIST.length}</div>
      <div class="progress-bar" style="max-width:320px;margin:6px auto 0"><div style="width:${Math.round(cleared / STAGE_LIST.length * 100)}%"></div></div>
    ` }));
    const menu = U.el("div", { class: "home-menu" });
    const mk = (cls, icon, title, desc, onclick) => {
      const b = U.el("button", { class: "menu-btn " + cls, onclick });
      b.innerHTML = `<span class="m-icon">${icon}</span><span class="m-title">${title}</span><span class="m-desc">${desc}</span>`;
      return b;
    };
    if (next) menu.appendChild(mk("primary", "▶", `つづきから：${U.esc(next.id)} ${U.esc(next.title)}`, `第${next.chapter.id}章 ${U.esc(next.chapter.title)} ― ${U.esc(next.desc)}`, () => Game.intro(next.id)));
    else menu.appendChild(mk("primary", "🏆", "ぜんぶクリア！", "好きなステージで星★★★を目指そう", () => Game.map()));
    menu.appendChild(mk("", "🗺️", "ステージをえらぶ", "10の章・33ステージ", () => Game.map()));
    menu.appendChild(mk("", "💪", `にがて問題${weakN ? `<span class="m-badge">${weakN}</span>` : ""}`, weakN ? "まちがえた問題にもう一度チャレンジ" : "まちがえた問題がここにたまるよ", () => weakN ? Game.startWeak() : UI.toast("今はにがて問題はないよ！")));
    menu.appendChild(mk("", "📖", "ことばカード図鑑", "品詞の見分け方をいつでも確認", () => Game.cards()));
    menu.appendChild(mk("", "⚙️", "設定", "BGM・効果音・ふりがな・記録のリセット", () => UI.settings((k) => { if (k === "ruby" || k === "unlockAll") Game.home(); })));
    scr.appendChild(menu);
    return scr;
  },

  // ---------- ステージ一覧 ----------
  map() {
    const scr = U.el("div", { class: "screen" });
    scr.appendChild(this.topbar({ back: () => Game.home(), title: "ステージをえらぶ" }));
    const next = Game.nextStage();
    CHAPTERS.forEach(ch => {
      const wrap = U.el("div", { class: "chapter" });
      const done = ch.stages.filter(s => Storage.stage(s.id) && Storage.stage(s.id).cleared).length;
      const chStars = ch.stages.reduce((a, s) => a + ((Storage.stage(s.id) || {}).stars || 0), 0);
      wrap.appendChild(U.el("div", { class: "chapter-head", style: `background:${ch.color}`, html: `<span class="ch-icon">${ch.icon}</span><span><div class="ch-title">第${ch.id}章 ${U.esc(ch.title)}</div><div class="ch-sub">${U.esc(ch.sub)}</div></span><span class="ch-prog">${done}/${ch.stages.length} クリア ・ ★${chStars}</span>` }));
      const list = U.el("div", { class: "stage-list" });
      ch.stages.forEach(st => {
        const rec = Storage.stage(st.id);
        const unlocked = Game.isUnlocked(st.id);
        const isNext = next && next.id === st.id;
        const card = U.el("button", { class: "stage-card" + (unlocked ? "" : " locked") + (isNext ? " next" : ""), onclick: () => { if (unlocked) Game.intro(st.id); else UI.toast("前のステージをクリアするとひらくよ"); } });
        card.innerHTML = `${isNext ? '<span class="st-next">つぎはここ</span>' : ""}<span class="st-id">${U.esc(st.id)}${unlocked ? "" : " 🔒"}</span><span class="st-title">${U.esc(st.title)}</span><span class="st-desc">${U.esc(st.desc)}</span><span class="st-stars">${rec && rec.cleared ? UI.starsHtml(rec.stars) : '<span class="off">★★★</span>'}</span>`;
        list.appendChild(card);
      });
      wrap.appendChild(list);
      scr.appendChild(wrap);
    });
    return scr;
  },

  // ---------- ステージ紹介 ----------
  intro(stage) {
    const scr = U.el("div", { class: "screen" });
    scr.appendChild(this.topbar({ back: () => Game.map(), title: `第${stage.chapter.id}章 ${U.esc(stage.chapter.title)}` }));
    const card = U.el("div", { class: "card" });
    const rec = Storage.stage(stage.id);
    card.innerHTML = `<span class="tag">ステージ ${U.esc(stage.id)}</span> ${rec && rec.cleared ? `<span class="tag" style="color:#b45309;background:#fff1b8">ベスト ${UI.starsHtml(rec.stars)}</span>` : ""}
      <div class="intro-title">${U.esc(stage.title)}</div>
      <div class="intro-desc">${U.esc(stage.desc)}</div>`;
    const pb = U.el("div", { class: "point-box" });
    pb.appendChild(U.el("h3", { text: "💡 今回のポイント" }));
    const ul = U.el("ul");
    stage.point.forEach(p => ul.appendChild(U.el("li", { text: p })));
    pb.appendChild(ul);
    card.appendChild(pb);
    if (stage.learn && stage.learn.length) {
      const mc = U.el("div", { class: "mini-cards" });
      mc.appendChild(U.el("span", { class: "small muted", style: "align-self:center", text: "📖 くわしく：" }));
      stage.learn.forEach(k => {
        const info = POS[k] || EXTRA_CARDS.find(c => c.key === k);
        if (!info) return;
        mc.appendChild(U.el("button", { class: "mini-card", style: `border-color:${info.color};color:${info.color}`, onclick: () => UI.cardDetail(k) }, k));
      });
      card.appendChild(mc);
    }
    const row = U.el("div", { class: "btn-row", style: "margin-top:18px" });
    row.appendChild(U.el("button", { class: "btn btn-primary", style: "min-width:220px", onclick: () => Game.startStage(stage.id) }, `▶ はじめる（${stage.count}問）`));
    card.appendChild(row);
    scr.appendChild(card);
    return scr;
  },

  // ---------- 図鑑 ----------
  cards() {
    const scr = U.el("div", { class: "screen" });
    scr.appendChild(this.topbar({ back: () => Game.home(), title: "📖 ことばカード図鑑" }));
    const learned = Game.learnedKeys();
    const grid1 = U.el("div", { class: "card-grid" });
    const mk = info => {
      const b = U.el("button", { class: "pos-card", onclick: () => UI.cardDetail(info.key) });
      b.innerHTML = `<div class="pc-head" style="background:${info.color}"><span>${U.esc(info.key)} <span class="pc-kana">${U.esc(info.key.length <= 4 ? (info.kana || "") : "")}</span></span>${learned[info.key] ? '<span class="pc-learned">学習ずみ ✓</span>' : ""}</div>
        <div class="pc-body">${U.esc(info.short || info.def)}</div>
        <div class="pc-ex">例：${U.esc((info.ex || []).slice(0, 4).join("・"))}</div>`;
      return b;
    };
    scr.appendChild(U.el("div", { class: "card-section", text: "品詞（ことばの種類）" }));
    POS_ORDER.forEach(k => grid1.appendChild(mk(POS[k])));
    scr.appendChild(grid1);
    scr.appendChild(U.el("div", { class: "card-section", text: "考え方・文の成分" }));
    const grid2 = U.el("div", { class: "card-grid" });
    EXTRA_CARDS.forEach(c => grid2.appendChild(mk(c)));
    scr.appendChild(grid2);
    return scr;
  },

  // ---------- 問題画面の骨組み ----------
  play(ctx) {
    const scr = U.el("div", { class: "screen" });
    const dots = U.el("div", { class: "progress-dots" });
    ctx.results.forEach((r, i) => {
      let cls = "";
      if (r) cls = r.score >= r.max ? "ok" : (r.score > 0 ? "part" : "ng");
      if (i === ctx.qIndex) cls += " now";
      dots.appendChild(U.el("i", { class: cls.trim() }));
    });
    for (let i = ctx.results.length; i < ctx.total; i++) dots.appendChild(U.el("i", { class: i === ctx.qIndex ? "now" : "" }));
    const hintBtn = U.el("button", { class: "icon-btn hint-btn", title: "ヒント", onclick: ctx.onHint }, "💡 ヒント");
    const right = [];
    if (ctx.onPoint) right.push(U.el("button", { class: "icon-btn", title: "今回のポイント", onclick: ctx.onPoint }, "📌"));
    right.push(hintBtn);
    scr.appendChild(this.topbar({
      back: ctx.onQuit,
      title: `<span class="muted small">${U.esc(ctx.title)}</span>`,
      right
    }));
    scr.appendChild(dots);
    const prompt = U.el("div", { class: "q-prompt" });
    scr.appendChild(prompt);
    const body = U.el("div", { class: "q-body" });
    scr.appendChild(body);
    const hintBox = U.el("div", { class: "hint-box hidden" });
    scr.appendChild(hintBox);
    const fbArea = U.el("div");
    scr.appendChild(fbArea);
    return { root: scr, prompt, body, hintBox, hintBtn, fbArea };
  },

  setPrompt(el, html, no, total, isRetry) {
    el.innerHTML = `<span class="q-no">${no}/${total}</span>${isRetry ? '<span class="retry-badge">もう一度！</span>' : ""}<span>${html}</span>`;
  },

  showHint(box, level, text) {
    box.classList.remove("hidden");
    box.innerHTML = `<div class="h-title">💡 ヒント ${level}</div>${U.esc(text)}`;
  },

  // 仕分け
  qSort(q, onAnswer) {
    const v = q.view;
    const wrap = U.el("div");
    const card = U.el("div", { class: "word-card" });
    const main = U.el("div", { class: "w-main" + (v.display.length > 7 ? " long" : "") });
    if (v.html) main.innerHTML = v.html; else main.textContent = v.display;
    card.appendChild(main);
    if (v.sub) card.appendChild(U.el("div", { class: "w-sub", text: v.sub }));
    wrap.appendChild(card);
    const n = v.boxes.length;
    const grid = U.el("div", { class: "box-grid c" + (n <= 5 ? n : n <= 8 ? 8 : 10) });
    const btns = {};
    v.boxes.forEach(b => {
      const info = labelInfo(b);
      const btn = U.el("button", { class: "pos-btn", style: `border-color:${info.color};color:${info.color}`, html: UI.label(b), onclick: () => onAnswer(b) });
      btns[b] = btn;
      grid.appendChild(btn);
    });
    wrap.appendChild(grid);
    return {
      el: wrap,
      mark(chosen, correct) {
        for (const b in btns) {
          btns[b].disabled = true;
          if (b === correct) { btns[b].classList.add("correct"); btns[b].style.background = labelInfo(b).color; }
          else if (b === chosen) btns[b].classList.add("wrong");
          else btns[b].classList.add("dim");
        }
      }
    };
  },

  // 2択・3択
  qChoice(q, onAnswer) {
    const v = q.view;
    const wrap = U.el("div");
    const card = U.el("div", { class: "word-card" });
    const main = U.el("div", { class: "w-main" + (v.display.length > 7 ? " long" : "") });
    if (v.html) main.innerHTML = v.html; else main.textContent = v.display;
    card.appendChild(main);
    if (v.sub) card.appendChild(U.el("div", { class: "w-sub", text: v.sub }));
    wrap.appendChild(card);
    const list = U.el("div", { class: v.options.length <= 2 ? "opt-row" : "opt-list" });
    const btns = {};
    v.options.forEach(o => {
      const info = POS[o] || ROLE[o] || JITA[o];
      const btn = U.el("button", { class: "opt-btn", html: info ? UI.label(o) : U.esc(o), onclick: () => onAnswer(o) });
      if (info) { btn.style.borderColor = info.color; btn.style.color = info.color; }
      btns[o] = btn;
      list.appendChild(btn);
    });
    wrap.appendChild(list);
    return {
      el: wrap,
      mark(chosen, correct) {
        for (const o in btns) {
          btns[o].disabled = true;
          btns[o].style.color = "";
          if (o === correct) btns[o].classList.add("correct");
          else if (o === chosen) btns[o].classList.add("wrong");
          else btns[o].classList.add("dim");
        }
      }
    };
  },

  // 穴うめ
  qFill(q, onAnswer) {
    const v = q.view;
    const wrap = U.el("div");
    const sent = U.el("div", { class: "fill-sent" });
    const blank = U.el("span", { class: "blank", text: "　" });
    sent.appendChild(document.createTextNode(v.pre));
    sent.appendChild(blank);
    sent.appendChild(document.createTextNode(v.post));
    wrap.appendChild(sent);
    const row = U.el("div", { class: "opt-row" });
    const btns = {};
    v.options.forEach(o => {
      const btn = U.el("button", { class: "opt-btn", text: o, onclick: () => onAnswer(o) });
      btns[o] = btn;
      row.appendChild(btn);
    });
    wrap.appendChild(row);
    return {
      el: wrap,
      mark(chosen, correct) {
        for (const o in btns) {
          btns[o].disabled = true;
          if (o === correct) btns[o].classList.add("correct");
          else if (o === chosen) btns[o].classList.add("wrong");
          else btns[o].classList.add("dim");
        }
        if (chosen === correct) { blank.textContent = correct; blank.classList.add("ok"); }
        else {
          blank.textContent = chosen; blank.classList.add("ng");
          const okSpan = U.el("span", { class: "blank ok", text: correct });
          blank.after(okSpan);
        }
      }
    };
  },

  // 文を文節チップで表示（find 用）
  qFind(q, state, onAnswer) {
    const sent = q.view.sentence;
    const wrap = U.el("div");
    const box = U.el("div", { class: "sent-box" });
    const chips = [];
    sent.chunks.forEach((c, i) => {
      const chip = U.el("button", { class: "chip", onclick: () => onAnswer(i) });
      const t = U.el("span", { class: "c-text" });
      t.textContent = c.text;
      if (c.punct) t.appendChild(U.el("span", { class: "punct", text: c.punct }));
      chip.appendChild(t);
      const f = state.found[i];
      if (f) {
        const info = labelInfo(f);
        chip.style.borderColor = info.color; chip.style.background = info.light;
        chip.appendChild(U.el("span", { class: "c-label", style: `background:${info.color}`, text: f }));
        chip.disabled = true;
      }
      chips.push(chip);
      box.appendChild(chip);
      if (c.punct === "。" && i < sent.chunks.length - 1) box.appendChild(U.el("span", { class: "sent-break" }));
    });
    wrap.appendChild(box);
    return {
      el: wrap,
      mark(chosen, correct, key) {
        chips.forEach((ch, i) => {
          ch.disabled = true;
          if (i === correct) {
            ch.classList.add("correct");
            const info = labelInfo(key);
            ch.appendChild(U.el("span", { class: "c-label", style: `background:${info.color}`, text: key }));
          } else if (i === chosen) ch.classList.add("wrong");
        });
      }
    };
  },

  // 文法探偵（単語ごとにラベル）
  qDetect(q, state, onAnswer) {
    const v = q.view, sent = v.sentence;
    const cur = v.targets[state.step];
    const allMode = v.targets.length > sent.chunks.length;
    const wrap = U.el("div");
    const box = U.el("div", { class: "sent-box" });
    sent.chunks.forEach((c, ci) => {
      const row = U.el("span", { class: "tokrow" });
      c.tokens.forEach((t, ti) => {
        const key = ci + "-" + ti;
        const isTarget = cur && cur.ci === ci && cur.ti === ti;
        const isFz = ti > 0 && !allMode;
        const tok = U.el("span", { class: "tok" + (isTarget ? " target" : "") + (isFz ? " fz" : "") + (state.labels[key] ? " done" : ""), style: `font-size:${isFz ? 20 : 26}px;font-weight:${isFz ? 500 : 700}` });
        tok.appendChild(U.el("span", { text: t.w }));
        const lab = state.labels[key];
        if (lab) {
          const info = labelInfo(lab.correct);
          tok.appendChild(U.el("span", { class: "t-label", style: `background:${info.color}`, text: (lab.ok ? "" : "✗→") + lab.correct }));
        }
        row.appendChild(tok);
      });
      if (c.punct) row.appendChild(U.el("span", { class: "punct", style: "font-size:26px;font-weight:700;color:#6b7280;margin-left:-4px", text: c.punct }));
      box.appendChild(row);
      if (c.punct === "。" && ci < sent.chunks.length - 1) box.appendChild(U.el("span", { class: "sent-break" }));
    });
    wrap.appendChild(box);
    const tgtTok = sent.chunks[cur.ci].tokens[cur.ti];
    wrap.appendChild(U.el("div", { class: "center", style: "margin-top:12px;font-weight:800;font-size:18px", html: `「<mark>${U.esc(tgtTok.w)}</mark>」の品詞は？ <span class="muted small">（${state.step + 1}/${v.targets.length}）</span>` }));
    const n = v.palette.length;
    const grid = U.el("div", { class: "box-grid c" + (n <= 5 ? n : n <= 8 ? 8 : 10) });
    const btns = {};
    v.palette.forEach(b => {
      const info = labelInfo(b);
      const btn = U.el("button", { class: "pos-btn", style: `border-color:${info.color};color:${info.color};min-height:52px;font-size:16px`, html: UI.label(b), onclick: () => onAnswer(b) });
      btns[b] = btn;
      grid.appendChild(btn);
    });
    wrap.appendChild(grid);
    return {
      el: wrap,
      mark(chosen, correct) {
        for (const b in btns) {
          btns[b].disabled = true;
          if (b === correct) { btns[b].classList.add("correct"); btns[b].style.background = labelInfo(b).color; }
          else if (b === chosen) btns[b].classList.add("wrong");
          else btns[b].classList.add("dim");
        }
      }
    };
  },

  // 答え合わせパネル
  feedback(res, opts) {
    const fb = U.el("div", { class: "feedback " + (res.ok ? "ok" : "ng") });
    fb.appendChild(U.el("div", { class: "fb-title", html: res.ok ? ("⭕ 正解！" + (res.streak >= 3 ? ` <span class="streak">🔥 ${res.streak}問連続！</span>` : "")) : "❌ おしい！" }));
    if (!res.ok) {
      const ans = res.correctText != null ? `「${U.esc(res.correctText)}」` : UI.label(String(res.correct), false);
      fb.appendChild(U.el("div", { class: "fb-answer", html: `正解は <b>${ans}</b>` }));
    }
    (res.lines || []).filter(Boolean).forEach(l => fb.appendChild(U.el("div", { class: "fb-line", text: l })));
    if (res.tip) fb.appendChild(U.el("div", { class: "fb-tip", html: `<span class="lbl">見分け方</span>${U.esc(res.tip)}` }));
    const actions = U.el("div", { class: "fb-actions" });
    if (res.cardKey && (POS[res.cardKey] || EXTRA_CARDS.find(c => c.key === res.cardKey))) {
      actions.appendChild(U.el("button", { class: "link-btn", onclick: () => UI.cardDetail(res.cardKey) }, `📖 ${res.cardKey}のカードを見る`));
    } else actions.appendChild(U.el("span"));
    const nextBtn = U.el("button", { class: "btn btn-primary", onclick: opts.onNext }, opts.nextLabel || "次へ ▶");
    actions.appendChild(nextBtn);
    fb.appendChild(actions);
    setTimeout(() => { fb.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, 50);
    return fb;
  },

  // まちがえた問題をもう一度、のお知らせ
  retryBanner(n, onStart) {
    const scr = U.el("div", { class: "screen" });
    const card = U.el("div", { class: "card center", style: "margin-top:30px" });
    card.innerHTML = `<div style="font-size:40px">🔁</div><div style="font-size:22px;font-weight:900;margin:6px 0">もう一度チャレンジ！</div>
      <p class="muted">さっきまちがえた ${n} 問に、もう一回挑戦しよう。<br>見分け方を思い出せば、きっとできる！</p>`;
    card.appendChild(U.el("button", { class: "btn btn-accent", onclick: onStart }, "チャレンジする ▶"));
    scr.appendChild(card);
    return scr;
  },

  // ---------- 結果 ----------
  result(sum) {
    const scr = U.el("div", { class: "screen" });
    const hero = U.el("div", { class: "result-hero" });
    const isWeak = sum.mode === "weak";
    let title = isWeak ? "にがて問題 おつかれさま！" : "ステージクリア！";
    let msg;
    const rate = sum.max ? sum.score / sum.max : 0;
    if (isWeak) msg = sum.solved > 0 ? `${sum.solved}問を克服した！ このちょうしで少しずつ減らしていこう。` : "むずかしかったね。説明を読んで、またチャレンジしよう。";
    else if (rate >= 1) msg = "パーフェクト！ 見分け方がしっかり身についているよ。";
    else if (rate >= 0.75) msg = "よくできた！ まちがえた問題は「にがて問題」で、もう一度できるよ。";
    else if (rate >= 0.5) msg = "まずはクリア！ 説明をもう一度読んで、再チャレンジすると星が増えるよ。";
    else msg = "むずかしかったね。「今回のポイント」を見直して、もう一度やってみよう。できるようになるよ！";
    hero.innerHTML = `<div class="r-title">${title}</div>`;
    if (!isWeak) {
      const stars = U.el("div", { class: "stars-big" });
      for (let i = 0; i < 3; i++) stars.appendChild(U.el("span", { class: i < sum.stars ? "on" : "", text: "★" }));
      hero.appendChild(stars);
    }
    hero.appendChild(U.el("div", { class: "result-score", text: isWeak ? `${sum.results.length}問中 ${sum.okCount}問 正解` : `${sum.results.length}問中 ${sum.okCount}問 正解${sum.max !== sum.results.length ? `（${sum.score}/${sum.max}ポイント）` : ""}` }));
    hero.appendChild(U.el("div", { class: "result-msg", text: msg }));
    if (sum.newBest && !isWeak) hero.appendChild(U.el("div", { class: "tag", style: "margin-top:8px;background:#fff1b8;color:#92400e", text: "🎉 自己ベスト更新！" }));
    if (sum.rankUp) hero.appendChild(U.el("div", { class: "tag", style: "margin-top:8px;background:#e8ecff;color:#3a54d6", text: `👑 称号が「${sum.rankUp.name}」になった！` }));
    scr.appendChild(hero);

    const list = U.el("div", { class: "result-list" });
    sum.results.forEach(r => {
      const mark = r.score >= r.max ? "⭕" : (r.score > 0 ? "△" : "❌");
      const item = U.el("div", { class: "result-item" });
      item.innerHTML = `<span class="ri-mark">${mark}</span><span class="ri-text">${U.esc(UI.qSummary(r.q))}</span><span class="ri-ans">${U.esc(UI.qAnswerText(r.q))}</span>`;
      list.appendChild(item);
    });
    scr.appendChild(list);
    if (sum.weakAdded > 0) scr.appendChild(U.el("div", { class: "weak-note", html: `💪 まちがえた ${sum.weakAdded} 問を「にがて問題」に入れたよ。ホームからいつでも復習できる。` }));

    const row = U.el("div", { class: "btn-row", style: "margin-top:18px" });
    if (isWeak) {
      row.appendChild(U.el("button", { class: "btn btn-ghost", onclick: () => Game.home() }, "ホームへ"));
      if (Storage.weakIds().length) row.appendChild(U.el("button", { class: "btn btn-primary", onclick: () => Game.startWeak() }, "つづけて復習 ▶"));
    } else {
      row.appendChild(U.el("button", { class: "btn btn-ghost", onclick: () => Game.map() }, "ステージ一覧"));
      row.appendChild(U.el("button", { class: "btn btn-ghost", onclick: () => Game.startStage(sum.stage.id) }, "🔁 もう一度"));
      const nxt = STAGE_LIST[sum.stage.index + 1];
      if (nxt) row.appendChild(U.el("button", { class: "btn btn-primary", onclick: () => Game.intro(nxt.id) }, `次のステージへ ▶`));
      else row.appendChild(U.el("button", { class: "btn btn-primary", onclick: () => Game.home() }, "ホームへ"));
    }
    scr.appendChild(row);
    return scr;
  },

  qSummary(q) {
    const v = q.view;
    switch (q.type) {
      case "sort": case "choice": return v.display;
      case "fill": return (v.pre + "＿＿" + v.post).replace(/\s+/g, "");
      case "find": return v.sentence.text;
      case "detect": return v.sentence.text;
    }
    return "";
  },
  qAnswerText(q) {
    const v = q.view;
    switch (q.type) {
      case "sort": case "choice": return q.check(0, "__none__").correct;
      case "fill": return q.check(0, "__none__").correct;
      case "find": return v.steps.map(s => s.key).join("・");
      case "detect": return "文法探偵";
    }
    return "";
  }
};
