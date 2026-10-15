
// ─── [08-04] 정답 한 덩어리 → 낱개 뜻 쪼개기 ───
// 정답 JSON의 뜻은 "[명] 1. 주소 2. 연설 [동] 1. 주소를 쓰다 2. 연설하다"처럼
// 여러 뜻이 한 문자열에 붙어 있다. 예전에는 쉼표로만 잘라서 "주소" 한 낱개를 못 알아봤고,
// 학생앱 오답 복습에서 맞게 써도 오답이 됐다. 채점 워커의 정답 분해와 같은 취지로
// 품사 딱지·뜻 번호·빗금·대괄호 이형태·괄호 부연까지 쪼갠다.
const VOCAB_POS_TAG_RE = /[\[(](?:명|동|형|부|전|접|대|감|조|관|수|자|타|복|숙어|구|명사|동사|형용사|부사)[\])]/g;
// "교육[훈련]시키다" → 교육시키다 / 훈련시키다 (대괄호는 바로 앞 낱말을 갈아 끼운다는 뜻)
function expandVocabBracketForms(s, depth = 0) {
  if (depth > 3) return [s];
  const m = /^(.*?)([^\s\[\]]+)\[([^\[\]]+)\](.*)$/.exec(s);
  if (!m) return [s];
  const [, head, prev, inner, tail] = m;
  return [
    ...expandVocabBracketForms(head + prev + tail, depth + 1),
    ...expandVocabBracketForms(head + inner + tail, depth + 1),
  ];
}
// "얻다(성취하다/달성하다)" → 얻다 / 성취하다 / 달성하다,  "(정)반대" → 반대 / 정반대
function expandVocabParenForms(s) {
  const out = new Set([s]);
  out.add(s.replace(/\([^()]*\)/g, " "));
  out.add(s.replace(/\(([0-9A-Za-z가-힣]{1,6})\)/g, "$1"));  // (정)반대 → 정반대 (한자 부연은 합치지 않음)
  (s.match(/\(([^()]*)\)/g) || []).forEach(g => {
    const inner = g.slice(1, -1);
    if (inner.includes("/")) inner.split("/").forEach(p => out.add(p));
    else if (/^\S{2,}$/.test(inner) && !/등|따위/.test(inner)) out.add(inner);
  });
  return [...out];
}
function splitVocabMeaningCandidates(raw = "") {
  const src = String(raw || "").trim();
  if (!src) return [];
  let t = src.replace(VOCAB_POS_TAG_RE, "|");                       // 품사 딱지를 칸막이로
  t = t.replace(/(^|[\s\]|)])\s*\d{1,2}\s*[.)]\s*/g, "$1|");        // "1." "2)" 뜻 번호를 칸막이로
  t = t.replace(/[\u2460-\u2469]/g, "|");                            // 원문자 ①②③ 도 칸막이로
  const pieces = [];
  let buf = "", depth = 0;
  for (const ch of t) {                                              // 괄호 안의 쉼표·빗금은 자르지 않는다
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    if (depth === 0 && (ch === "|" || ch === ";" || ch === "," || ch === "，" || ch === "/" || ch === "·" || ch === "・" || ch === "ㆍ")) { pieces.push(buf); buf = ""; continue; }
    buf += ch;
  }
  pieces.push(buf);
  const out = [], seen = new Set();
  const push = (v) => {
    let c = String(v || "").replace(/[\[\]]/g, "")
      .replace(/^[\-\u2013\u2014·,;.\s|]+/, "").replace(/[,;.\s|]+$/, "")
      .replace(/\s+/g, " ").trim();
    if (!c) return;
    // 쉼표로 미리 잘린 조각이면 괄호 짝이 안 맞는다 — 그때는 괄호 글자를 떼어낸다
    const opens = (c.match(/\(/g) || []).length, closes = (c.match(/\)/g) || []).length;
    if (opens !== closes) c = c.replace(/[()]/g, "").trim();
    if (!c) return;
    if (!/[0-9A-Za-z가-힣ㄱ-ㅎ\u4e00-\u9fff]/.test(c)) return;        // 부호만 남은 것 버리기
    if (/^(등을|등의|등에|등|따위)$/.test(c)) return;
    const k = c.replace(/\s+/g, "").toLowerCase();
    if (seen.has(k)) return;
    seen.add(k); out.push(c);
  };
  pieces.forEach(p => expandVocabBracketForms(p).forEach(b => expandVocabParenForms(b).forEach(push)));
  return out.slice(0, 60);
}
// 저장된 정답들 + 낱개로 쪼갠 뜻을 전부 모아 "이 중 하나면 정답" 목록으로 만든다.
export function buildVocabAcceptList(correctAnswers = []) {
  const out = [], seen = new Set();
  const add = (v) => {
    const c = String(v || "").trim();
    if (!c) return;
    const k = c.replace(/\s+/g, "").toLowerCase();
    if (seen.has(k)) return;
    seen.add(k); out.push(c);
  };
  (Array.isArray(correctAnswers) ? correctAnswers : []).forEach(a => {
    add(a);
    splitVocabMeaningCandidates(a).forEach(add);
  });
  return out;
}
// 화면에 보여줄 정답 — 괄호 안 부연이 붙은 형태는 빼고 낱개 뜻만 깔끔하게
export function buildVocabAnswerDisplay(correctAnswers = []) {
  const all = [], seen = new Set();
  (Array.isArray(correctAnswers) ? correctAnswers : []).forEach(a => {
    splitVocabMeaningCandidates(a).forEach(c => {
      const k = c.replace(/\s+/g, "").toLowerCase();
      if (seen.has(k)) return;
      seen.add(k); all.push(c);
    });
  });
  const clean = all.filter(c => !/[()]/.test(c));
  const list = (clean.length ? clean : all).slice(0, 12);
  return list.length ? list.join(", ") : (Array.isArray(correctAnswers) ? correctAnswers.join(", ") : "");
}
