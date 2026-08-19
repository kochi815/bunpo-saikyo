// questions.js ― 文の解析と、問題オブジェクトの生成
//
// 問題オブジェクトの形:
// {
//   id, type ("sort"|"choice"|"fill"|"find"|"detect"), pos (主な答え), steps (手順の数),
//   view: 表示用データ（type ごとにちがう）,
//   hints(step)  → [ヒント1, ヒント2, ヒント3]
//   check(step, answer) → { ok, correct, lines:[説明文], tip, cardKey }
// }

const ROLE_ABBR = { "主": "主語", "述": "述語", "修": "修飾語", "接": "接続語", "独": "独立語" };
const JIRITSU = ["名詞", "動詞", "形容詞", "形容動詞", "副詞", "連体詞", "接続詞", "感動詞"];

// ---------- 文の解析 ----------
function parseSentence(def) {
  const chunks = [];
  const parts = def.s.trim().split(/\s+/);
  let sentNo = 0;
  parts.forEach((raw, i) => {
    let p = raw, punct = "";
    if (p.endsWith("、") || p.endsWith("。")) { punct = p.slice(-1); p = p.slice(0, -1); }
    const tokens = p.split("+").map(tk => {
      const slash = tk.indexOf("/");
      const w = tk.slice(0, slash);
      let rest = tk.slice(slash + 1), base = null;
      const colon = rest.indexOf(":");
      if (colon >= 0) { base = rest.slice(colon + 1); rest = rest.slice(0, colon); }
      const pos = POS_ABBR[rest] || rest;
      return { w, pos, base: base || w };
    });
    chunks.push({ tokens, punct, text: tokens.map(t => t.w).join(""), head: tokens[0], idx: i, sentNo });
    if (punct === "。") sentNo++;
  });
  if (def.roles) {
    const roles = def.roles.trim().split(/\s+/);
    chunks.forEach((c, i) => { c.role = ROLE_ABBR[roles[i]] || null; });
  }
  const mod = {};
  if (def.mod) def.mod.split(",").forEach(pr => { const [a, b] = pr.split(">").map(Number); mod[a] = b; });
  const text = chunks.map(c => c.text + c.punct).join("");
  return { chunks, hasRoles: !!def.roles, mod, lvl: def.lvl || 2, text, id: U.hash(text) };
}

const SENT = SENTENCES.map(parseSentence);

// ---------- 表示用ヘルパ ----------
function posTipHtml(pos) {
  const P = labelInfo(pos);
  return P.tip || "";
}

// ---------- 問題生成 ----------
const Q = {

  // 仕分け：言葉をカードで見せて、箱（品詞）を選ぶ
  sort(tok, boxes, opts) {
    opts = opts || {};
    const ans = opts.answer || tok.pos;
    const display = opts.display || tok.w;
    const sub = opts.sub != null ? opts.sub : (tok.ex && tok.ex !== tok.w ? tok.ex : (tok.n && tok.pos === "形容動詞" ? `${tok.w.slice(0, -1)}な${tok.n}` : (tok.n ? `${tok.w}${tok.n}` : "")));
    const q = {
      id: "sort:" + display + ":" + boxes.join(""), type: "sort", pos: ans, steps: 1,
      view: { prompt: opts.prompt || "この言葉は、どの仲間？", display, sub, boxes: boxes.slice() },
      hints() { return Q.posHints(tok, boxes, ans); },
      check(step, chosen) {
        const ok = chosen === ans;
        const lines = ok ? [Explain.reasonOf(tok)] : [Explain.notReason(tok, chosen), Explain.reasonOf(tok)];
        return { ok, correct: ans, lines, tip: posTipHtml(ans), cardKey: ans };
      }
    };
    return q;
  },

  // 品詞のヒント（仕分け・探偵で共通）
  posHints(tok, boxes, ans) {
    const base = tok.base || tok.w;
    const stem = base.endsWith("だ") || base.endsWith("い") ? base.slice(0, -1) : base;
    const h1 = boxes.filter(b => POS[b]).slice(0, 5).map(b => "・" + POS[b].tip).join("\n") || "言い切りの形にもどして、終わりの音を見てみよう。";
    let h2 = "";
    switch (ans) {
      case "名詞": h2 = `「${tok.w}が」「${tok.w}を」と言えるかな？言えるなら、名前を表す言葉だよ。`; break;
      case "動詞": h2 = `言い切りの形にすると「${base}」。最後の音はウ段（う・く・す・つ・ぬ・む・る…）かな？`; break;
      case "形容詞": h2 = `言い切りの形「${base}」は何で終わる？${tok.n ? `「${base}${tok.n}」と言える？` : ""}`; break;
      case "形容動詞": h2 = `「${stem}な＋名詞」${tok.n ? `（${stem}な${tok.n}）` : ""}と言えるかな？言い切りは「${stem}だ」？`; break;
      case "副詞": h2 = `「${tok.w}」の後ろに来るのは、名詞？それとも動詞や形容詞？${tok.ex ? `（${tok.ex}）` : ""}形は変わるかな？`; break;
      case "連体詞": h2 = `「${tok.w}」の後ろに来るのは、必ず名詞？${tok.ex ? `（${tok.ex}）` : ""}「${tok.w}。」だけで文は終われる？`; break;
      case "接続詞": h2 = `「${tok.w}」は前の文と後ろの文をつないでいるかな？${tok.ex ? `（${tok.ex}）` : ""}`; break;
      case "感動詞": h2 = `「${tok.w}。」だけで文になるかな？`; break;
      case "助詞": h2 = `「${tok.w}」の形は変わるかな？（「${tok.w}かった」のように言える？）`; break;
      case "助動詞": h2 = `「${tok.w}」の形は変わるかな？${tok.alt ? `（${tok.alt}）` : ""}`; break;
      default: h2 = "言い切りの形にもどして考えよう。";
    }
    return [h1, h2, Explain.reasonOf(tok)];
  },

  // 2択・3択（言葉を見せて、品詞などを選ぶ）
  choice(cfg) {
    // cfg: { id, display, sub, prompt, options, answer, pos, ok(lines), ng: chosen→lines, hints: [], tip, cardKey }
    const q = {
      id: cfg.id, type: "choice", pos: cfg.pos || cfg.answer, steps: 1,
      view: { prompt: cfg.prompt, display: cfg.display, sub: cfg.sub || "", options: cfg.options.slice(), big: cfg.big !== false, html: cfg.html || null },
      hints() { return cfg.hints; },
      check(step, chosen) {
        const ok = chosen === cfg.answer;
        const lines = ok ? cfg.ok : (typeof cfg.ng === "function" ? cfg.ng(chosen) : (cfg.ng[chosen] || [])).concat(cfg.ok);
        return { ok, correct: cfg.answer, lines, tip: cfg.tip || "", cardKey: cfg.cardKey || null };
      }
    };
    return q;
  },

  // 形容詞？形容動詞？（語幹を見せて「〜な／〜い」テスト）
  adjChoice(tok) {
    const isNa = tok.pos === "形容動詞";
    const stem = tok.w.slice(0, -1);
    const display = isNa ? stem : tok.w;
    const n = tok.n || "もの";
    const options = ["形容詞", "形容動詞"];
    const ok = isNa
      ? [`「${stem}な${n}」と「〜な」でつながるので形容動詞。言い切りは「${stem}だ」。${stem.endsWith("い") ? "「い」で終わって見えるけど形容詞ではないよ。" : ""}`]
      : [`「${tok.w}${n}」と「〜い」でつながるので形容詞。「${stem}な${n}」とは言わないね。`];
    const ng = isNa
      ? { "形容詞": [`形容詞なら「〜い＋名詞」になるはず。でも「${stem}い${n}」とは言わず、「${stem}な${n}」と言うね。`] }
      : { "形容動詞": [`形容動詞なら「〜な＋名詞」になるはず。でも「${stem}な${n}」とは言わず、「${tok.w}${n}」と言うね。`] };
    return Q.choice({
      id: "adj:" + display, display, sub: `（${display}＋${n}）`, prompt: `「${display}」は どっち？`,
      options, answer: tok.pos, pos: tok.pos, ok, ng,
      hints: [
        `「${display}」と「${n}」をつなげて言ってみよう。`,
        isNa ? `「${stem}な${n}」？ それとも「${stem}い${n}」？ 自然なのはどっち？` : `「${tok.w}${n}」？ それとも「${stem}な${n}」？ 自然なのはどっち？`,
        isNa ? `「〜な」でつながる言葉は形容動詞。` : `「〜い」でつながる言葉は形容詞。`
      ],
      tip: isNa ? POS["形容動詞"].tip : POS["形容詞"].tip, cardKey: tok.pos
    });
  },

  // 4-3 などの手書き2択
  mixChoice(item) {
    const options = U.shuffle([item.a, item.d]);
    return Q.choice({
      id: "mix:" + item.w + ":" + item.ctx, display: item.w, sub: `（${item.ctx}）`, prompt: `「${item.w}」は どっち？`,
      options, answer: item.a, pos: item.a,
      ok: [item.why], ng: { [item.d]: [item.not] },
      hints: [
        labelInfo(item.a).tip + "\n" + labelInfo(item.d).tip,
        `「${item.ctx}」の「${item.w}」は、形が変わる？ 後ろに何が来る？ 言い切りの形はある？`,
        item.why
      ],
      tip: labelInfo(item.a).tip, cardKey: POS[item.a] ? item.a : null
    });
  },

  // 穴うめ（接続詞・助詞・自他動詞）
  fill(cfg) {
    // cfg: { id, pre, post, options, answer, ok, ng(chosen)→lines, hints, tip, cardKey, pos, inline }
    const q = {
      id: cfg.id, type: "fill", pos: cfg.pos || cfg.answer, steps: 1,
      view: { prompt: cfg.prompt || "＿＿に入る言葉はどれ？", pre: cfg.pre, post: cfg.post, options: U.shuffle(cfg.options), inline: !!cfg.inline },
      hints() { return cfg.hints; },
      check(step, chosen) {
        const ok = chosen === cfg.answer;
        const lines = ok ? cfg.ok : (typeof cfg.ng === "function" ? cfg.ng(chosen) : (cfg.ng[chosen] || [])).concat(cfg.ok);
        return { ok, correct: cfg.answer, lines, tip: cfg.tip || "", cardKey: cfg.cardKey || null };
      }
    };
    return q;
  },

  // 文の中からさがせ（文節をタップ）  steps: [{kind:"pos"|"role"|"mod", key, answerIdx, prompt}]
  find(sent, steps) {
    const q = {
      id: "find:" + sent.id + ":" + steps.map(s => s.kind + s.key + (s.answerIdx)).join("_"),
      type: "find", pos: steps[0].key, steps: steps.length,
      view: { sentence: sent, steps },
      hints(step) {
        const st = steps[step];
        const ans = sent.chunks[st.answerIdx];
        if (st.kind === "pos") {
          return [
            POS[st.key].tip,
            Q.findSearchHint(st.key),
            `「${ans.text}」に注目！ ${Explain.reasonOf(ans.head)}`
          ];
        }
        if (st.kind === "role") {
          const pred = sent.chunks.find(c => c.role === "述語");
          if (st.key === "述語") return ["述語は、ふつう文の最後にあるよ。", "「どうする」「どんなだ」「何だ」にあたる言葉はどれ？", `「${ans.text}」に注目！ ${Explain.roleReason(sent, st.answerIdx, "述語")}`];
          if (st.key === "主語") return [`まず述語「${pred ? pred.text : ""}」を見つけよう。`, `述語「${pred ? pred.text : ""}」に「何が？」「だれが？」と聞いてみよう。「〜が」「〜は」「〜も」の形が多いよ。`, `「${ans.text}」に注目！ ${Explain.roleReason(sent, st.answerIdx, "主語")}`];
        }
        if (st.kind === "mod") {
          const target = sent.chunks[st.targetIdx];
          return [`「${target.text}」の前にある言葉を見てみよう。`, `「どんな${target.head.pos === "名詞" ? target.text : ""}？」「どのように？」の答えになる言葉はどれ？`, `「${ans.text}」に注目！ ${Explain.roleReason(sent, st.answerIdx, "修飾語")}`];
        }
        return ["", "", ""];
      },
      check(step, chosenIdx) {
        const st = steps[step];
        const ok = chosenIdx === st.answerIdx;
        const ans = sent.chunks[st.answerIdx];
        const ch = sent.chunks[chosenIdx];
        let lines, tip, cardKey;
        if (st.kind === "pos") {
          tip = POS[st.key].tip; cardKey = st.key;
          lines = ok ? [Explain.reasonOf(ans.head)]
            : [`${Explain.chunkPosNote(ch)}。${st.key}は${POS[st.key].short}で、この文では「${ans.text}」。`, Explain.reasonOf(ans.head)];
        } else if (st.kind === "role") {
          tip = ROLE[st.key].tip; cardKey = "主語・述語・修飾語";
          lines = ok ? [Explain.roleReason(sent, st.answerIdx, st.key)]
            : [`「${ch.text}」は${ch.role || "ちがう働き"}だよ${ch.role ? "（" + Explain.roleReason(sent, chosenIdx, ch.role).replace(/。$/, "") + "）" : ""}。`, Explain.roleReason(sent, st.answerIdx, st.key)];
        } else {
          const target = sent.chunks[st.targetIdx];
          tip = ROLE["修飾語"].tip; cardKey = "主語・述語・修飾語";
          lines = ok ? [Explain.roleReason(sent, st.answerIdx, "修飾語")]
            : [`「${ch.text}」は「${target.text}」をくわしくしていないね${ch.role ? `（「${ch.text}」は${ch.role}）` : ""}。`, Explain.roleReason(sent, st.answerIdx, "修飾語")];
        }
        return { ok, correct: st.answerIdx, correctText: ans.text, lines, tip, cardKey };
      }
    };
    return q;
  },

  findSearchHint(pos) {
    return {
      "名詞": "「〜が」「〜を」「〜は」「〜の」の前にある言葉を見てみよう。",
      "動詞": "動きや「ある・いる」を表す言葉。文の終わりにあることが多いよ（形が変わっていることもある）。",
      "形容詞": "「い」で終わる（または「く」「かった」に形を変えた）様子の言葉をさがそう。",
      "形容動詞": "「だ」「な」「に」で終わる様子の言葉をさがそう。言い切ると「〜だ」になるよ。",
      "副詞": "「どのように？」「どのくらい？」の答えになる、形の変わらない言葉をさがそう。",
      "連体詞": "すぐ後ろに名詞があって、形の変わらない言葉をさがそう（この・その・大きな…）。",
      "接続詞": "文の最初で、前の文と後ろの文をつないでいる言葉をさがそう。",
      "感動詞": "文の最初で「、」で区切られている、一言で文になる言葉をさがそう。"
    }[pos] || "";
  },

  // 文法探偵（文の中の言葉に、順番に品詞のラベルをつける）
  detect(sent, targets, palette) {
    // targets: [{ci, ti}]（文節番号・単語番号）
    const q = {
      id: "detect:" + sent.id + ":" + (targets.length > sent.chunks.length ? "all" : "head"),
      type: "detect", pos: "文法探偵", steps: targets.length,
      view: { sentence: sent, targets, palette: palette.slice() },
      tokenAt(step) { const t = targets[step]; return sent.chunks[t.ci].tokens[t.ti]; },
      hints(step) {
        const tok = q.tokenAt(step);
        const h = Q.posHints(tok, palette, tok.pos);
        h[0] = "言い切りの形にもどす → 終わりの音を見る。形が変わらないなら、後ろに何が来るかを見る。（くっつく言葉なら、形が変わるかどうか）";
        return h;
      },
      check(step, chosen) {
        const tok = q.tokenAt(step);
        const ok = chosen === tok.pos;
        const lines = ok ? [Explain.reasonOf(tok)] : [Explain.notReason(tok, chosen), Explain.reasonOf(tok)];
        return { ok, correct: tok.pos, lines, tip: posTipHtml(tok.pos), cardKey: tok.pos };
      }
    };
    return q;
  },

  // 接続詞の穴うめ
  conjFill(item) {
    const cat = item.cat;
    const catOf = w => { const f = WORDS["接続詞"].find(x => x.w === w); return f ? f.cat : ""; };
    return Q.fill({
      id: "conj:" + item.pre + item.post, pre: item.pre, post: (item.inline ? "" : "、") + item.post, options: item.opts, answer: item.a, pos: "接続詞", inline: item.inline,
      prompt: "＿＿に入る つなぎ言葉（接続詞）はどれ？",
      ok: [`「${item.a}」は${cat}の接続詞。${CONJ_CATS[cat].desc}ときに使うよ。`],
      ng: chosen => {
        const c = catOf(chosen);
        return [`「${chosen}」は${c ? c + "の接続詞（" + CONJ_CATS[c].desc + "）" : "ここでは合わない接続詞"}。「${item.pre}」と「${item.post}」の関係は、${CONJ_CATS[cat].desc}（${cat}）だね。`];
      },
      hints: [
        "前の文と後ろの文は、どんな関係？（理由→結果？ 反対？ つけ加え？ 選ぶ？ 言いかえ？ 話題を変える？）",
        `「${item.pre}」→「${item.post}」は、${CONJ_CATS[cat].desc}関係だね。`,
        `${cat}の接続詞は「${CONJ_CATS[cat].ex}」など。`
      ],
      tip: POS["接続詞"].tip, cardKey: "接続詞"
    });
  },

  // 自動詞・他動詞：「が」「を」どっち？
  jitaParticle(pair, which) {
    const v = which === "ji" ? pair.ji : pair.ta;
    const ans = which === "ji" ? "が" : "を";
    const pre = which === "ji" ? `${pair.obj}` : `${pair.agent}は ${pair.obj}`;
    return Q.fill({
      id: "jitap:" + v, pre, post: v + "。", options: ["が", "を"], answer: ans, pos: which === "ji" ? "自動詞" : "他動詞",
      prompt: "＿に入るのは「が」？「を」？",
      ok: which === "ji"
        ? [`「${pair.obj}が${v}」。「${v}」は「〜が」で使う自動詞（自分で・自然にそうなる）。ペアの他動詞は「${pair.ta}」（${pair.obj}を${pair.ta}）。`]
        : [`「${pair.obj}を${v}」。「${v}」は「〜を」で使う他動詞（何かに働きかける）。ペアの自動詞は「${pair.ji}」（${pair.obj}が${pair.ji}）。`],
      ng: chosen => [`「${pair.obj}${chosen}${v}」は不自然だね。`],
      hints: [
        "「〜が」なら自動詞、「〜を」なら他動詞。声に出して読んでみよう。",
        `「${pair.obj}が${v}」と「${pair.obj}を${v}」、自然なのはどっち？`,
        which === "ji" ? `「${v}」は自分で・自然にそうなる動き（自動詞）だから「が」。` : `「${v}」は何かに働きかける動き（他動詞）だから「を」。`
      ],
      tip: JITA[which === "ji" ? "自動詞" : "他動詞"].tip, cardKey: "自動詞・他動詞"
    });
  },

  // 自動詞・他動詞の仕分け
  jitaSort(pair, which) {
    const v = which === "ji" ? pair.ji : pair.ta;
    const ans = which === "ji" ? "自動詞" : "他動詞";
    const other = which === "ji" ? pair.ta : pair.ji;
    const why = which === "ji"
      ? `「${v}」は「${pair.obj}が${v}」と「〜が」で使う自動詞。（ペアの他動詞は「${other}」）`
      : `「${v}」は「${pair.obj}を${v}」と「〜を」で使う他動詞。（ペアの自動詞は「${other}」）`;
    const not = {
      "自動詞": `「${pair.obj}が${v}」とは言わないね。「${pair.obj}を${v}」と「〜を」をつけて使うので他動詞。`,
      "他動詞": `「${pair.obj}を${v}」とは言わないね。「${pair.obj}が${v}」と「〜が」で使うので自動詞。`
    };
    return {
      id: "jitas:" + v, type: "sort", pos: ans, steps: 1,
      view: { prompt: "この動詞は、どっち？", display: v, sub: "", boxes: ["自動詞", "他動詞"] },
      hints() { return ["「〜が」で使うなら自動詞、「〜を」で使うなら他動詞。", `「${pair.obj}が${v}」と「${pair.obj}を${v}」、自然なのはどっち？`, why]; },
      check(step, chosen) {
        const ok = chosen === ans;
        return { ok, correct: ans, lines: ok ? [why] : [not[chosen], why], tip: JITA[ans].tip, cardKey: "自動詞・他動詞" };
      }
    };
  },

  // 自動詞・他動詞：文に合う動詞を選ぶ
  jitaFill(pair, which) {
    const ans = which === "ji" ? pair.ji : pair.ta;
    const other = which === "ji" ? pair.ta : pair.ji;
    const pre = which === "ji" ? `${pair.obj}が ` : `${pair.agent}は ${pair.obj}を `;
    return Q.fill({
      id: "jitaf:" + ans + which, pre, post: "。", options: [pair.ji, pair.ta], answer: ans, pos: which === "ji" ? "自動詞" : "他動詞",
      prompt: "＿＿に入る動詞はどれ？",
      ok: [which === "ji" ? `「${pair.obj}が」と「〜が」に続くのは自動詞「${ans}」。` : `「${pair.obj}を」と「〜を」に続くのは他動詞「${ans}」。`],
      ng: () => [`「${pre}${other}」は不自然だね。「${other}」は${which === "ji" ? "「〜を」で使う他動詞" : "「〜が」で使う自動詞"}。`],
      hints: ["「〜が」の後ろは自動詞、「〜を」の後ろは他動詞。", `「${pre}${pair.ji}」と「${pre}${pair.ta}」、自然なのはどっち？`, which === "ji" ? `「〜が」に続くのは自動詞「${ans}」。` : `「〜を」に続くのは他動詞「${ans}」。`],
      tip: JITA[which === "ji" ? "自動詞" : "他動詞"].tip, cardKey: "自動詞・他動詞"
    });
  },

  // 助詞の穴うめ
  joshiFill(item) {
    const [pre, post] = item.s.split("＿");
    return Q.fill({
      id: "joshi:" + item.s, pre, post, options: item.opts, answer: item.a, pos: "助詞",
      prompt: "＿に入る助詞（くっつく言葉）はどれ？",
      ok: [item.why],
      ng: chosen => [`「${chosen}」を入れると「${pre}${chosen}${post}」。これは不自然だね。`],
      hints: [
        "それぞれの言葉を入れて、声に出して読んでみよう。自然なのはどっち？",
        "「が」＝何が（主語）、「を」＝何を（相手）、「に・へ」＝どこに・どこへ、「で」＝どこで・何で、「と」＝だれと、「の」＝だれの、「から・まで」＝どこから・どこまで",
        item.why
      ],
      tip: POS["助詞"].tip, cardKey: "助詞"
    });
  },

  // 助動詞の意味
  auxChoice(item) {
    const M = AUX_MEANINGS[item.a];
    const html = item.s.replace(item.t, `<mark>${item.t}</mark>`);
    return Q.choice({
      id: "aux:" + item.s + item.t, display: item.s, html, sub: "", prompt: `「${item.t}」は、どんな意味を足している？`,
      options: U.shuffle(item.opts), answer: item.a, pos: "助動詞",
      ok: [`「${item.t}」は${item.a}（${M.desc}）を表す助動詞。${item.note ? item.note + "。" : ""}`],
      ng: chosen => { const N = AUX_MEANINGS[chosen]; return [N ? `${chosen}を表すのは「${N.aux}」（例：${N.ex}）。ここの「${item.t}」はちがうよ。` : ""]; },
      hints: [
        "「ない」＝打ち消し、「た」＝過去、「たい」＝希望、「ます・です」＝丁寧、「れる・られる」＝受け身・可能、「せる・させる」＝使役、「う・よう」＝意志・さそい、「らしい」＝推定、「そうだ」＝様子、「ようだ」＝たとえ、「だ」＝断定",
        `「${item.s}」全体は、どんな気持ち・どんな場面を表しているかな？`,
        `「${item.t}」は${item.a}（${M.desc}）。`
      ],
      tip: POS["助動詞"].tip, cardKey: "助動詞"
    });
  },

  // 助詞？助動詞？（文脈つき仕分け）
  fuzokuSort(item) {
    const tok = { w: item.w, pos: item.pos, func: item.func, m: item.m, alt: item.alt, why: item.why, notWhy: item.notWhy };
    const html = item.ctx.replace(/【(.+?)】/, "<mark>$1</mark>");
    const q = Q.sort(tok, ["助詞", "助動詞"], { display: item.w, sub: "", prompt: `色のついた「${item.w}」は、どっち？` });
    q.id = "fuzoku:" + item.ctx;
    q.view.html = html;
    return q;
  },

  // 「ない」チャレンジ
  naiChoice(item) {
    const html = item.ctx.replace(/【(.+?)】/, "<mark>$1</mark>");
    return Q.choice({
      id: "nai:" + item.ctx, display: item.ctx.replace(/[【】]/g, ""), html, prompt: "この「ない」は どっち？",
      options: U.shuffle([item.a, item.d]), answer: item.a, pos: item.a,
      ok: [item.why], ng: { [item.d]: [item.not] },
      hints: [
        "「ない」を「ぬ」に言いかえられるかな？ 言いかえられたら助動詞。",
        `「${item.ctx.replace("【ない】", "ぬ").replace(/[【】]/g, "")}」と言える？`,
        item.why
      ],
      tip: "「ぬ」に言いかえられる「ない」→ 助動詞／言いかえられない「ない」→ 形容詞", cardKey: "助動詞"
    });
  },

  // 述語の品詞
  predChoice(item) {
    const html = item.s.replace(item.pred, `<mark>${item.pred}</mark>`);
    return Q.choice({
      id: "pred:" + item.s, display: item.s, html, prompt: `述語「${item.pred}」の品詞は？`,
      options: U.shuffle(item.opts), answer: item.a, pos: item.a === "名詞＋だ" ? "名詞" : item.a,
      ok: [item.why],
      ng: chosen => {
        const P = POS[chosen];
        if (chosen === "名詞＋だ") return [`「名詞＋だ」なら「六年生だ」のように「〜な＋名詞」と言えないはず。「${item.pred}」はちがうね。`];
        return [P ? `${chosen}なら、${P.short}。「${item.pred}」はちがうね。` : ""];
      },
      hints: [
        "述語は「どうする（動詞）」「どんなだ（形容詞・形容動詞）」「何だ（名詞＋だ）」のどれ？",
        `「${item.pred}」の言い切りは何で終わる？ ウ段なら動詞、「い」なら形容詞、「だ」なら形容動詞か名詞＋だ（「〜な＋名詞」と言えれば形容動詞）。`,
        item.why
      ],
      tip: "述語になるのは 動詞・形容詞・形容動詞（＋名詞＋だ）", cardKey: "主語・述語・修飾語"
    });
  }
};

// ---------- 問題プール（ステージごとの出題候補を作る） ----------
const Pools = {
  words(pos, filter) {
    let list = (WORDS[pos] || []).map(w => Object.assign({}, w, { pos }));
    if (filter) list = list.filter(filter);
    return list;
  },

  // 仕分け：boxes の各品詞の単語から作る。limit: 品詞ごとの上限, filter: 単語フィルタ
  sort(boxes, opts) {
    opts = opts || {};
    const out = [];
    for (const pos of boxes) {
      let list = Pools.words(pos, opts.filter);
      if (opts.limit) list = U.shuffle(list).slice(0, opts.limit);
      for (const tok of list) out.push(Q.sort(tok, boxes, opts.sortOpts));
    }
    return out;
  },

  // 形容詞？形容動詞？（〜な／〜い テスト）
  adjChoice() {
    const a = Pools.words("形容詞", w => w.n);
    const b = Pools.words("形容動詞", w => w.n);
    return a.concat(b).map(Q.adjChoice);
  },

  // 形が変わった言葉の仕分け
  conjForms(posList, boxes, extraPrompt) {
    const out = [];
    for (const pos of posList) {
      for (const f of CONJ_FORMS[pos] || []) {
        const tok = { w: f.w, base: f.base, att: f.att, pos };
        out.push(Q.sort(tok, boxes, { sub: "", prompt: extraPrompt || "言い切りの形にもどすと、どの仲間？" }));
      }
    }
    return out;
  },

  derivedNouns(boxes) {
    return DERIVED_NOUNS.map(d => Q.sort(Object.assign({ pos: "名詞" }, d), boxes, { sub: d.ex, prompt: "この言葉は、どの仲間？" }));
  },

  // 文の中からさがせ（品詞）
  findPos(posList, opts) {
    opts = opts || {};
    const out = [];
    for (const sent of SENT) {
      if (opts.minLvl && sent.lvl < opts.minLvl) continue;
      if (opts.maxLvl && sent.lvl > opts.maxLvl) continue;
      const singles = [];
      for (const pos of posList) {
        const idxs = sent.chunks.map((c, i) => c.head.pos === pos ? i : -1).filter(i => i >= 0);
        if (idxs.length === 1) singles.push({ pos, idx: idxs[0] });
      }
      if (opts.multi) {
        if (singles.length >= 2) {
          const picked = U.shuffle(singles).slice(0, opts.multi);
          out.push(Q.find(sent, picked.map(s => ({ kind: "pos", key: s.pos, answerIdx: s.idx, prompt: `${s.pos}を タップしよう` }))));
        }
      } else {
        for (const s of singles) out.push(Q.find(sent, [{ kind: "pos", key: s.pos, answerIdx: s.idx, prompt: `${s.pos}を タップしよう` }]));
      }
    }
    return out;
  },

  // 主語・述語をさがせ
  findRole(role, opts) {
    opts = opts || {};
    const out = [];
    for (const sent of SENT) {
      if (!sent.hasRoles) continue;
      if (sent.chunks.some(c => c.punct === "。" && c.idx < sent.chunks.length - 1)) continue; // 2文のものは除く
      if (opts.maxLvl && sent.lvl > opts.maxLvl) continue;
      const idxs = sent.chunks.map((c, i) => c.role === role ? i : -1).filter(i => i >= 0);
      if (idxs.length !== 1) continue;
      if (role === "主語" && sent.chunks.length < 3 && !opts.allowShort) continue;
      out.push(Q.find(sent, [{ kind: "role", key: role, answerIdx: idxs[0], prompt: `${role}を タップしよう` }]));
    }
    return out;
  },

  // 修飾語をさがせ（「○○」をくわしくしている言葉は？）
  findMod() {
    const out = [];
    for (const sent of SENT) {
      if (!sent.hasRoles) continue;
      const targets = {};
      for (const a in sent.mod) { const b = sent.mod[a]; (targets[b] = targets[b] || []).push(Number(a)); }
      for (const b in targets) {
        if (targets[b].length !== 1) continue;
        const a = targets[b][0];
        const tgt = sent.chunks[Number(b)];
        out.push(Q.find(sent, [{ kind: "mod", key: "修飾語", answerIdx: a, targetIdx: Number(b), prompt: `「${tgt.text}」を くわしくしている言葉（修飾語）は？` }]));
      }
    }
    return out;
  },

  // 文法探偵
  detect(opts) {
    opts = opts || {};
    const out = [];
    for (const sent of SENT) {
      if (opts.minLvl && sent.lvl < opts.minLvl) continue;
      if (opts.maxLvl && sent.lvl > opts.maxLvl) continue;
      if (opts.maxChunks && sent.chunks.length > opts.maxChunks) continue;
      if (opts.needPos && !sent.chunks.some(c => opts.needPos.includes(c.head.pos))) continue;
      const targets = [];
      sent.chunks.forEach((c, ci) => {
        c.tokens.forEach((t, ti) => { if (opts.all || ti === 0) targets.push({ ci, ti }); });
      });
      const palette = opts.all ? POS_ORDER.slice() : JIRITSU.slice();
      out.push(Q.detect(sent, targets, palette));
    }
    return out;
  },

  pred() { return PRED_ITEMS.map(Q.predChoice); },
  mix() { return MIX_CHOICE.map(Q.mixChoice); },
  conjFill() { return CONJ_FILL.map(Q.conjFill); },
  jitaParticle() { const o = []; for (const p of JITA_PAIRS) { o.push(Q.jitaParticle(p, "ji")); o.push(Q.jitaParticle(p, "ta")); } return o; },
  jitaSort() { const o = []; for (const p of JITA_PAIRS) { o.push(Q.jitaSort(p, "ji")); o.push(Q.jitaSort(p, "ta")); } return o; },
  jitaFill() { const o = []; for (const p of JITA_PAIRS) { o.push(Q.jitaFill(p, "ji")); o.push(Q.jitaFill(p, "ta")); } return o; },
  joshiFill() { return JOSHI_FILL.map(Q.joshiFill); },
  aux() { return AUX_ITEMS.map(Q.auxChoice); },
  fuzoku() { return FUZOKU_ITEMS.map(Q.fuzokuSort).concat(NAI_ITEMS.map(Q.naiChoice)); }
};
