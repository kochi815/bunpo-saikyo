// main.js ― 起動
window.addEventListener("DOMContentLoaded", () => {
  try {
    Game.init();
    // 開発・確認用：URL の #map / #cards / #intro=1-1 / #stage=1-1 で直接その画面をひらく
    // #stage=1-1&a=ok（正解を自動で押す）/ &a=ng（不正解を自動で押す）/ #result=1-1（結果画面）
    const params = {};
    location.hash.slice(1).split("&").forEach(kv => { const [k, v] = kv.split("="); if (k) params[k] = v == null ? true : decodeURIComponent(v); });
    if (params.settings) UI.settings(() => {});
    else if (params.map) Game.map();
    else if (params.cards) Game.cards();
    else if (params.intro) Game.intro(params.intro);
    else if (params.stage) {
      Game.startStage(params.stage);
      if (params.a && Game.state && Game.state.current) {
        const q = Game.state.current.q;
        let opts = [];
        if (q.type === "sort") opts = q.view.boxes;
        else if (q.type === "choice" || q.type === "fill") opts = q.view.options;
        else if (q.type === "find") opts = q.view.sentence.chunks.map((c, i) => i);
        else if (q.type === "detect") opts = q.view.palette;
        const v = opts.find(o => q.check(0, o).ok === (params.a === "ok"));
        if (v !== undefined) Game.answer(v);
      }
    } else if (params.result) {
      const st = STAGE_MAP[params.result];
      const pool = Game.pool(st.id).slice(0, st.count);
      const results = pool.map((q, i) => ({ q, score: i % 3 === 0 ? 0 : 1, max: 1, ok: i % 3 !== 0 }));
      const score = results.filter(r => r.ok).length;
      UI.mount(UI.result({ mode: "stage", stage: st, results, score, max: results.length, okCount: score, stars: Storage.calcStars(score, results.length), weakAdded: results.length - score, newBest: true }));
    }
  } catch (e) {
    console.error(e);
    document.getElementById("app").innerHTML = '<div class="card" style="margin:20px"><b>エラーが起きました。</b><br><span class="small muted">' + (e && e.message ? e.message : e) + '</span></div>';
  }
});
