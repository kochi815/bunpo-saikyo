// game.js ― ゲームの進行（画面の切りかえ・出題・採点・保存）

const Game = {
  state: null,   // 今プレイ中の状態
  pools: {},     // stageId → 出題候補（作ったものをキャッシュ）

  init() {
    Storage.load();
    Sound.init(Storage.data.settings);
    UI.init();
    Storage.data.stats.sessions += 1;
    Storage.save();
    this.home();
  },

  // ---------- 画面 ----------
  home() { this.state = null; Sound.playBGM("home"); UI.mount(UI.home()); },
  map() { this.state = null; Sound.playBGM("home"); UI.mount(UI.map()); },
  cards() { Sound.playBGM("home"); UI.mount(UI.cards()); },
  intro(id) {
    const st = STAGE_MAP[id];
    if (!st) return this.home();
    Sound.playBGM("home");
    UI.mount(UI.intro(st));
  },
  // ステージの BGM（マスター・総合・探偵の章は少し盛り上がる曲）
  stageBgm(st) { return [6, 7, 10].includes(st.chapter.id) ? "challenge" : "play"; },

  // ---------- 進み具合 ----------
  isUnlocked(id) {
    if (Storage.data.settings.unlockAll) return true;
    const st = STAGE_MAP[id];
    if (!st || st.index === 0) return true;
    const prev = STAGE_LIST[st.index - 1];
    const rec = Storage.stage(prev.id);
    return !!(rec && rec.cleared);
  },
  nextStage() {
    return STAGE_LIST.find(s => !(Storage.stage(s.id) && Storage.stage(s.id).cleared)) || null;
  },
  learnedKeys() {
    const m = {};
    STAGE_LIST.forEach(s => {
      const r = Storage.stage(s.id);
      if (r && r.cleared) (s.learn || []).forEach(k => { m[k] = true; });
    });
    return m;
  },

  // ---------- 出題候補 ----------
  pool(stageId) {
    if (!this.pools[stageId]) {
      const st = STAGE_MAP[stageId];
      const p = st.pool();
      p.forEach(q => { q.stageId = stageId; });
      this.pools[stageId] = p;
    }
    return this.pools[stageId];
  },
  findQuestion(id, stageId) {
    if (!STAGE_MAP[stageId]) return null;
    return this.pool(stageId).find(q => q.id === id) || null;
  },

  // ---------- ステージ開始 ----------
  startStage(id) {
    const st = STAGE_MAP[id];
    const pool = this.pool(id);
    const qs = U.balancedSample(pool, Math.min(st.count, pool.length), q => q.pos);
    this.state = { mode: "stage", stage: st, queue: qs, qIndex: 0, results: [], retry: [], retryResults: [], phase: "main", weakAdded: 0, solved: 0, current: null, streak: 0 };
    Sound.play("select", 0.4);
    Sound.playBGM(this.stageBgm(st));
    this.nextQuestion();
    if (!Storage.data.seenIntro.hintTip) {
      Storage.data.seenIntro.hintTip = true; Storage.save();
      setTimeout(() => UI.toast("わからないときは、右上の 💡ヒント を押してね", 3500), 600);
    }
  },

  startWeak() {
    const ids = U.shuffle(Storage.weakIds()).slice(0, 10);
    const qs = [];
    ids.forEach(id => {
      const w = Storage.data.weak[id];
      const q = this.findQuestion(id, w.stage);
      if (q) qs.push(q); else { delete Storage.data.weak[id]; Storage.save(); }
    });
    if (!qs.length) { UI.toast("今はにがて問題はないよ！"); return this.home(); }
    this.state = { mode: "weak", stage: null, queue: qs, qIndex: 0, results: [], retry: [], retryResults: [], phase: "main", weakAdded: 0, solved: 0, current: null, streak: 0 };
    Sound.play("select", 0.4);
    Sound.playBGM("play");
    this.nextQuestion();
  },

  // ---------- 出題ループ ----------
  nextQuestion() {
    const s = this.state;
    if (!s) return;
    if (s.qIndex >= s.queue.length) {
      if (s.phase === "main" && s.retry.length) {
        UI.mount(UI.retryBanner(s.retry.length, () => {
          s.phase = "retry"; s.queue = s.retry.slice(); s.retry = []; s.qIndex = 0; s.retryResults = [];
          this.nextQuestion();
        }));
        return;
      }
      return this.finish();
    }
    const q = s.queue[s.qIndex];
    s.current = { q, step: 0, stepResults: [], hintLevel: 0, found: {}, labels: {}, answered: false };
    this.renderQuestion();
  },

  renderQuestion() {
    const s = this.state, c = s.current;
    const isRetry = s.phase === "retry";
    const title = s.mode === "weak" ? "💪 にがて問題" : `${s.stage.id} ${s.stage.title}${isRetry ? "（もう一度）" : ""}`;
    const results = isRetry ? s.retryResults : s.results;
    c.view = UI.play({ title, qIndex: s.qIndex, total: s.queue.length, results, onHint: () => this.hint(), onQuit: () => this.quit(), onPoint: s.stage ? () => UI.pointModal(s.stage) : null });
    this.renderStep();
    UI.mount(c.view.root);
  },

  renderStep() {
    const s = this.state, c = s.current, q = c.q, view = c.view;
    view.body.innerHTML = "";
    view.hintBox.classList.add("hidden");
    view.fbArea.innerHTML = "";
    c.hintLevel = 0; c.answered = false;
    view.hintBtn.textContent = "💡 ヒント";
    view.hintBtn.disabled = false;
    const onAnswer = val => this.answer(val);
    let promptHtml = "", r;
    switch (q.type) {
      case "sort": promptHtml = U.esc(q.view.prompt); r = UI.qSort(q, onAnswer); break;
      case "choice": promptHtml = U.esc(q.view.prompt); r = UI.qChoice(q, onAnswer); break;
      case "fill": promptHtml = U.esc(q.view.prompt); r = UI.qFill(q, onAnswer); break;
      case "find": {
        const st = q.view.steps[c.step];
        promptHtml = U.esc(st.prompt).replace(U.esc(st.key), `<span style="color:${labelInfo(st.key).color}">${UI.label(st.key)}</span>`);
        r = UI.qFind(q, c, onAnswer); break;
      }
      case "detect": promptHtml = "それぞれの言葉の品詞を答えよう"; r = UI.qDetect(q, c, onAnswer); break;
    }
    UI.setPrompt(view.prompt, promptHtml, s.qIndex + 1, s.queue.length, s.phase === "retry");
    c.renderer = r;
    view.body.appendChild(r.el);
  },

  hint() {
    const c = this.state && this.state.current;
    if (!c || c.answered) return;
    const hints = (c.q.hints(c.step) || []).filter(h => h);
    if (c.hintLevel >= hints.length) return;
    c.hintLevel++;
    UI.showHint(c.view.hintBox, c.hintLevel, hints[c.hintLevel - 1]);
    c.view.hintBtn.textContent = c.hintLevel < hints.length ? `💡 ヒント${c.hintLevel + 1}` : "💡 ヒント";
    if (c.hintLevel >= hints.length) c.view.hintBtn.disabled = true;
    Sound.play("select", 0.3);
  },

  answer(val) {
    const s = this.state, c = s.current, q = c.q;
    if (!c || c.answered) return;
    c.answered = true;
    const res = q.check(c.step, val);
    c.stepResults.push(res.ok);
    s.streak = res.ok ? s.streak + 1 : 0;
    res.streak = s.streak;
    Sound.play(res.ok ? "correct" : "wrong");
    Storage.addStats(res.ok);
    if (q.type === "find") {
      const st = q.view.steps[c.step];
      c.renderer.mark(val, res.correct, st.key);
      c.found[res.correct] = st.key;
    } else if (q.type === "detect") {
      c.renderer.mark(val, res.correct);
      const t = q.view.targets[c.step];
      c.labels[t.ci + "-" + t.ti] = { correct: res.correct, ok: res.ok };
    } else c.renderer.mark(val, res.correct);
    c.view.hintBtn.disabled = true;
    const isLastStep = c.step + 1 >= q.steps;
    const isLastQ = s.qIndex + 1 >= s.queue.length;
    const retryPending = s.phase === "main" && (s.retry.length > 0 || c.stepResults.includes(false));
    let nextLabel = isLastStep ? "次の問題へ ▶" : "次の言葉へ ▶";
    if (isLastStep && isLastQ) nextLabel = retryPending ? "次へ ▶" : "けっかを見る ▶";
    c.view.fbArea.innerHTML = "";
    c.view.fbArea.appendChild(UI.feedback(res, { onNext: () => this.afterFeedback(), nextLabel }));
  },

  afterFeedback() {
    const s = this.state, c = s && s.current;
    if (!s || !c) return;
    const q = c.q;
    if (c.step + 1 < q.steps) { c.step++; this.renderStep(); window.scrollTo(0, 0); return; }
    const score = c.stepResults.filter(Boolean).length, max = c.stepResults.length;
    const rec = { q, score, max, ok: score === max };
    if (s.phase === "main") {
      s.results.push(rec);
      if (!rec.ok) {
        s.retry.push(q);
        if (s.mode === "stage") { Storage.addWeak(q, s.stage.id); s.weakAdded++; }
      } else if (s.mode === "weak") { Storage.resolveWeak(q.id); s.solved++; }
    } else {
      s.retryResults.push(rec);
    }
    s.qIndex++;
    this.nextQuestion();
  },

  finish() {
    const s = this.state;
    const score = s.results.reduce((a, r) => a + r.score, 0);
    const max = s.results.reduce((a, r) => a + r.max, 0);
    const okCount = s.results.filter(r => r.ok).length;
    const sum = { mode: s.mode, stage: s.stage, results: s.results, score, max, okCount, weakAdded: s.weakAdded, solved: s.solved };
    if (s.mode === "stage") {
      const prevRank = rankFor(Storage.totalStars());
      const prevRec = Storage.stage(s.stage.id);
      const prevBest = prevRec ? prevRec.best : -1;
      Storage.recordStage(s.stage.id, score, max);
      sum.stars = Storage.calcStars(score, max);
      sum.newBest = !!prevRec && score > prevBest;
      const newRank = rankFor(Storage.totalStars());
      if (newRank.min > prevRank.min) sum.rankUp = newRank;
      if (sum.stars === 3) { Sound.play("trophy"); UI.confetti(); } else Sound.play("clear");
    } else {
      Sound.play("clear");
    }
    this.state = null;
    Sound.playBGM("result");
    UI.mount(UI.result(sum));
  },

  quit() {
    UI.confirm("とちゅうでやめる？（このステージの記録は残らないよ）", () => this.home(), { yes: "やめる" });
  }
};
