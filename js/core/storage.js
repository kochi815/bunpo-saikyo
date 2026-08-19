// storage.js ― 進み具合の保存（localStorage）

const Storage = {
  KEY: "bunpo_saikyoou_v1",
  data: null,

  defaults() {
    return {
      v: 1,
      stages: {},      // stageId → { best, max, stars, plays, cleared, lastAt }
      weak: {},        // questionId → { n, stage, pos, at }
      stats: { answered: 0, correct: 0, sessions: 0 },
      settings: { sound: true, bgm: true, bgmSet: "standard", bgmVolume: 0.4, unlockAll: false, ruby: true },
      seenIntro: {},   // stageId → true（ポイント表示を一度見たか）
      cards: {}        // cardKey → true（図鑑で見たことがあるか）
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(this.KEY);
      const d = raw ? JSON.parse(raw) : null;
      this.data = Object.assign(this.defaults(), d || {});
      this.data.settings = Object.assign(this.defaults().settings, (d && d.settings) || {});
      this.data.stats = Object.assign(this.defaults().stats, (d && d.stats) || {});
    } catch (e) {
      this.data = this.defaults();
    }
    return this.data;
  },

  save() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); } catch (e) { /* 保存できなくても続行 */ }
  },

  stage(id) { return this.data.stages[id] || null; },

  recordStage(id, correct, max) {
    const s = this.data.stages[id] || { best: 0, max: max, stars: 0, plays: 0, cleared: false };
    s.plays += 1;
    s.cleared = true;
    s.max = max;
    const stars = Storage.calcStars(correct, max);
    if (correct > s.best) s.best = correct;
    if (stars > s.stars) s.stars = stars;
    s.lastAt = Date.now();
    this.data.stages[id] = s;
    this.save();
    return s;
  },

  calcStars(correct, max) {
    if (max <= 0) return 0;
    const r = correct / max;
    if (r >= 1) return 3;
    if (r >= 0.75) return 2;
    return 1;
  },

  addWeak(q, stageId) {
    const w = this.data.weak[q.id] || { n: 0, stage: stageId, pos: q.pos || "", at: 0 };
    w.n += 1;
    w.at = Date.now();
    w.stage = stageId;
    this.data.weak[q.id] = w;
    this.save();
  },

  resolveWeak(qid) {
    const w = this.data.weak[qid];
    if (!w) return;
    w.n -= 1;
    if (w.n <= 0) delete this.data.weak[qid];
    this.save();
  },

  weakIds() { return Object.keys(this.data.weak); },

  addStats(correct) {
    this.data.stats.answered += 1;
    if (correct) this.data.stats.correct += 1;
    this.save();
  },

  totalStars() {
    let t = 0;
    for (const k in this.data.stages) t += this.data.stages[k].stars || 0;
    return t;
  },

  reset() {
    this.data = this.defaults();
    this.save();
  }
};
