// sound.js ― 効果音（SE）と BGM。assets/sounds の音を再生。無くてもエラーにしない。
// BGM は2セット（standard: mp3 / poke: 九九最強王から流用した wav）。設定で切りかえ。

const Sound = {
  files: {
    correct: "assets/sounds/se_correct.mp3",
    wrong: "assets/sounds/se_wrong.mp3",
    select: "assets/sounds/se_select.mp3",
    clear: "assets/sounds/se_levelup.mp3",
    trophy: "assets/sounds/se_trophy.mp3"
  },
  // BGM セット：home（ホーム・一覧・図鑑）/ play（ふつうのステージ）/ challenge（マスター・総合・探偵）/ result（結果）
  bgmSets: {
    standard: {
      label: "スタンダード",
      home: "assets/sounds/bgm_home.mp3", play: "assets/sounds/bgm_training.mp3",
      challenge: "assets/sounds/bgm_battle1.mp3", result: "assets/sounds/bgm_result.mp3"
    },
    poke: {
      label: "ポケモン風",
      home: "assets/sounds/poke/poke_home.wav", play: "assets/sounds/poke/poke_play.wav",
      challenge: "assets/sounds/poke/poke_challenge.wav", result: "assets/sounds/poke/poke_result.wav"
    }
  },
  // 場面ごとの基準音量（控えめに）。設定の音量（0〜1）をかけ算して使う
  bgmBase: { home: 0.55, play: 0.42, challenge: 0.48, result: 0.55 },

  enabled: true,        // SE
  bgmEnabled: true,
  bgmSet: "standard",
  bgmVolume: 0.4,       // 設定の音量（0〜1）
  currentKey: null,     // 今の場面（home/play/challenge/result）
  current: null,        // 再生中の Audio
  currentSrc: null,
  pendingKey: null,     // 自動再生がブロックされたときに、最初の操作で鳴らす
  fadeTimer: null,

  init(settings) {
    settings = settings || {};
    this.enabled = settings.sound !== false;
    this.bgmEnabled = settings.bgm !== false;
    this.bgmSet = this.bgmSets[settings.bgmSet] ? settings.bgmSet : "standard";
    if (typeof settings.bgmVolume === "number") this.bgmVolume = settings.bgmVolume;
    for (const k in this.files) {
      const a = new Audio();
      a.src = this.files[k];
      a.preload = "auto";
      a.onerror = () => {};
    }
    // ブラウザの自動再生制限：最初のタップ／クリック／キーで、待っていた BGM を鳴らす
    const unlock = () => {
      if (this.pendingKey) { const k = this.pendingKey; this.pendingKey = null; this.playBGM(k); }
    };
    ["pointerdown", "keydown", "touchstart"].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));
  },

  play(key, volume) {
    if (!this.enabled) return;
    const src = this.files[key];
    if (!src) return;
    try {
      const a = new Audio(src);
      a.volume = volume == null ? 0.5 : volume;
      a.onerror = () => {};
      a.play().catch(() => {});
    } catch (e) { /* 無視 */ }
  },

  targetVolume(key) {
    const base = this.bgmBase[key] == null ? 0.5 : this.bgmBase[key];
    return Math.max(0, Math.min(1, base * this.bgmVolume));
  },

  // 場面の BGM を鳴らす（同じ曲が流れていれば続ける）
  playBGM(key) {
    this.currentKey = key;
    if (!this.bgmEnabled) { this.stopBGM(true); return; }
    const set = this.bgmSets[this.bgmSet] || this.bgmSets.standard;
    const src = set[key];
    if (!src) { this.stopBGM(true); return; }
    if (this.current && this.currentSrc === src) {
      if (this.current.paused) this.current.play().catch(() => { this.pendingKey = key; });
      return;
    }
    this.stopBGM(true);
    const a = new Audio(src);
    a.loop = true;
    a.volume = 0;
    a.onerror = () => {};
    this.current = a;
    this.currentSrc = src;
    const p = a.play();
    if (p && p.catch) p.catch(() => { this.pendingKey = key; });
    this.fadeTo(a, this.targetVolume(key), 600);
  },

  stopBGM(keepKey) {
    if (this.fadeTimer) { clearInterval(this.fadeTimer); this.fadeTimer = null; }
    const a = this.current;
    if (a) {
      const start = a.volume;
      let t = 0;
      const timer = setInterval(() => {
        t += 50;
        a.volume = Math.max(0, start * (1 - t / 300));
        if (t >= 300) { clearInterval(timer); a.pause(); a.src = ""; }
      }, 50);
    }
    this.current = null;
    this.currentSrc = null;
    this.pendingKey = null;
    if (!keepKey) this.currentKey = null;
  },

  fadeTo(a, target, ms) {
    if (this.fadeTimer) clearInterval(this.fadeTimer);
    const start = a.volume, steps = Math.max(1, Math.round(ms / 50));
    let i = 0;
    this.fadeTimer = setInterval(() => {
      i++;
      a.volume = Math.max(0, Math.min(1, start + (target - start) * (i / steps)));
      if (i >= steps) { clearInterval(this.fadeTimer); this.fadeTimer = null; }
    }, 50);
  },

  // ---- 設定からの切りかえ ----
  setSE(on) { this.enabled = !!on; },
  setBGM(on) {
    this.bgmEnabled = !!on;
    if (!on) this.stopBGM(true);
    else if (this.currentKey) this.playBGM(this.currentKey);
  },
  setBGMSet(name) {
    if (!this.bgmSets[name]) return;
    this.bgmSet = name;
    const k = this.currentKey;
    this.stopBGM(true);
    if (k) this.playBGM(k);
  },
  setBGMVolume(v) {
    this.bgmVolume = Math.max(0, Math.min(1, v));
    if (this.current && this.currentKey) this.current.volume = this.targetVolume(this.currentKey);
  }
};
