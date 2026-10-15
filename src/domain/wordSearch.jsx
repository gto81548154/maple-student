import { VOCA_UNIT_WORDS, vocaShortLabel } from "./voca.jsx";

// ─── [125차수 10-12] 단어 검색 — 계산만 하는 곳(화면·인터넷 없음) ───
// 원장 결정(10-07): 홈 맨 위 검색 칸. 찾는 범위 = 정규 단어장 + 내 학교 내신 단어(지금 준비하는 시험 범위).
//   우리 단어장에 없는 단어는 네이버 사전 링크로 넘긴다(네이버 뜻을 앱 안으로 가져오지 않는다).

// 검색에 넣는 정규 단어장(쉬운 책 → 어려운 책 순서). 보카바이블(잠긴 책)·토익 책(원장 전용)은 넣지 않는다.
export const SEARCH_REGULAR_BOOKS = ["ve_ess", "ve_adv", "wm_basic", "wm_sn", "wm_hi", "ve_ety"];

const HANGUL_RE = /[ㄱ-ㆎ가-힣]/;
const hasHangul = (s) => HANGUL_RE.test(String(s || ""));

// 영어 낱말 비교용 글자: 소문자, 물결표(~)는 지우고, 띄어쓰기는 한 칸으로.
const squash = (s) => String(s || "").toLowerCase().replace(/[~∼〜～]/g, " ").replace(/[‘’`]/g, "'").replace(/\s+/g, " ").trim();
// "toward(s)" 같은 낱말은 toward 와 towards 두 가지로 다 찾을 수 있게 한다.
function wordKeys(w) {
  const raw = String(w || "");
  if (!/[()]/.test(raw)) { const k = squash(raw); return k ? [k] : []; }
  const a = squash(raw.replace(/\([^)]*\)/g, ""));       // 괄호 안을 뺀 것
  const b = squash(raw.replace(/[()]/g, ""));             // 괄호만 뺀 것
  return [...new Set([a, b].filter(Boolean))];
}
// 한글 뜻 비교용 글자: 띄어쓰기·물결표·괄호를 지운다("~을 생각해내다" → "을생각해내다").
const meanKey = (s) => String(s || "").toLowerCase().replace(/[\s~∼〜～()[\]]/g, "");

// 단어책 JSON([{id, lec, w, senses:[{pos, m:[뜻…]}], …}]) → 검색용 가벼운 줄 [[낱말, 뜻, 단원번호], …]
//   예문·발음·어원은 버린다(폰에 저장하는 크기를 줄이려고).
export function buildSearchRows(list) {
  const out = [];
  for (const it of (Array.isArray(list) ? list : [])) {
    if (!it || typeof it !== "object") continue;
    const w = String(it.w || "").trim();
    if (!w) continue;
    const mean = (Array.isArray(it.senses) ? it.senses : [])
      .map((s) => (Array.isArray(s?.m) ? s.m : []).map((x) => String(x || "").trim()).filter(Boolean).join(", "))
      .filter(Boolean).join("; ");
    const lec = Number(it.lec);
    out.push([w, mean, Number.isFinite(lec) ? lec : 0]);
  }
  return out;
}
export const goodSearchRows = (rows) => Array.isArray(rows) && rows.every((r) => Array.isArray(r) && typeof r[0] === "string" && typeof r[1] === "string");

// 내신 유닛 이름 — 마플보카의 nsLabel과 같은 규칙(한 과가 유닛 하나뿐이면 "1과").
const nsUnitLabel = (u) => (Number(u?.of) === 1 ? `${u.lesson}과` : String(u?.label || `${u?.lesson}과-${u?.seq}차`));

// ns_units.json(학교표)에서 내 학교 책과 이번 시험범위 유닛을 고른다. 없으면 null.
//   마플보카 loadNaesin과 같은 규칙: 학교가 쓰는 책 한 권 + 시험범위 과(nsl)에 해당하는 유닛만.
export function pickNaesinSource(unitsJson, sc, nsl) {
  const books = unitsJson && unitsJson.books;
  if (!books || typeof books !== "object" || !sc) return null;
  const want = new Set((nsl || []).map(Number));
  if (!want.size) return null;
  for (const id of Object.keys(books)) {
    const b = books[id];
    if (!b || !Array.isArray(b.schools) || !b.schools.includes(sc) || !Array.isArray(b.units)) continue;
    const inRange = b.units.filter((u) => want.has(Number(u.lesson)));
    if (!inRange.length) return null;
    const lecNames = {};
    inRange.forEach((u) => { lecNames[Number(u.lec)] = nsUnitLabel(u); });
    return { id, name: String(b.name || ""), lecNames };
  }
  return null;
}

// [129차수] 선생님이 올린 내신 묶음(ns-index)에서 "지금 준비하는 시험"의 책과 묶음 이름을 고른다. 없으면 null.
//   마플보카(128)와 같은 규칙: 지금 시험(year·exam)의 것 → 지금 시험을 모르면 가장 최근 시험. 지금 시험은 아는데 그 시험 단어가 아직 없으면 null.
//   이름: 부교재·교과서는 묶음 이름만("올림포스 13강"), 나머지는 종류를 앞에("모의고사 9월 학평 18~30번") — 이름에 이미 종류가 들어 있으면 그대로.
const NS_KINDS = ["교과서", "부교재", "모의고사", "외부지문", "변형문제"];
export function pickUploadedNaesin(indexJson, year, exam) {
  const exams = (indexJson && Array.isArray(indexJson.exams) ? indexJson.exams : [])
    .filter((e) => e && /^nsx_[0-9a-f]{6,20}$/.test(String(e.book || "")) && Array.isArray(e.sets));
  if (!exams.length) return null;
  const known = !!(Number(year) && exam);
  const hit = known ? exams.find((e) => Number(e.year) === Number(year) && String(e.exam) === String(exam)) : exams[0];
  if (!hit) return null;
  const lecNames = {};
  for (const x of hit.sets) {
    const no = Number(x?.no), title = String(x?.title || "").trim(), kind = String(x?.kind || "");
    if (!Number.isFinite(no) || !title || !NS_KINDS.includes(kind)) continue;
    lecNames[no] = (kind === "부교재" || kind === "교과서" || title.includes(kind)) ? title : `${kind} ${title}`;
  }
  return Object.keys(lecNames).length ? { id: String(hit.book), lecNames } : null;
}

// 결과 줄에 붙는 이름표 글자: "어휘끝 고난도 · UNIT 12" / "내신 단어 · 3과-1차"
function sourceLabel(src, lec) {
  if (src.ns) return `내신 단어 · ${src.lecNames?.[lec] || `${lec}`}`;
  return `${vocaShortLabel(src.id)} · ${VOCA_UNIT_WORDS[src.id] || "DAY"} ${lec}`;
}

// 검색 재료 하나를 만든다. rows = buildSearchRows 결과. 내신은 범위 안 유닛(lecNames에 있는 것)만 남긴다.
export function makeSearchSource({ id, ns = false, lecNames = null, rows }) {
  const use = ns && lecNames ? rows.filter((r) => lecNames[r[2]] != null) : rows;
  return {
    id, ns: !!ns, lecNames: lecNames || null, rows: use,
    keys: use.map((r) => wordKeys(r[0])),
    means: use.map((r) => r[1].split(/[,;]/).map(meanKey).filter(Boolean)),
  };
}

// 영어: 0 똑같음 · 1 앞부분이 같음 · 2 숙어 안 낱말의 앞부분 · 3 가운데 들어 있음(3글자 이상 칠 때만)
function scoreEnglish(keys, qs) {
  let best = 9;
  for (const q of qs) for (const k of keys) {
    let s = 9;
    if (k === q) s = 0;
    else if (k.startsWith(q)) s = 1;
    else if ((" " + k).includes(" " + q)) s = 2;
    else if (q.length >= 3 && k.includes(q)) s = 3;
    if (s < best) best = s;
  }
  return best;
}
// 한글 뜻: 0 뜻 하나와 똑같음 · 1 뜻의 앞부분 · 2 뜻 안에 들어 있음(2글자 이상 칠 때만)
function scoreKorean(means, q) {
  let best = 9;
  for (const m of means) {
    let s = 9;
    if (m === q) s = 0;
    else if (m.startsWith(q)) s = 1;
    else if (q.length >= 2 && m.includes(q)) s = 2;
    if (s < best) best = s;
  }
  return best;
}

// sources(앞에 있을수록 먼저 보여 줄 책) 안에서 query를 찾는다.
//   같은 낱말이 여러 책에 있으면 한 줄로 묶고(hits), 점수 → 짧은 낱말 → 가나다(abc) 순으로 limit개.
//   돌려주는 값: [{ w, key, score, hits:[{ srcId, ns, lec, mean, label }] }]
export function searchWords(sources, query, limit = 8) {
  const korean = hasHangul(query);
  // 영어 검색어도 낱말과 같은 방식으로 다듬는다 — "toward(s)"를 그대로 쳐도(최근 찾은 단어를 눌러도) toward·towards로 찾는다.
  const q = korean ? meanKey(query) : wordKeys(query);
  if (!q.length) return [];
  const byKey = new Map();
  (sources || []).forEach((src, si) => {
    for (let i = 0; i < src.rows.length; i++) {
      const score = korean ? scoreKorean(src.means[i], q) : scoreEnglish(src.keys[i], q);
      if (score >= 9) continue;
      const r = src.rows[i];
      const key = src.keys[i][0] || squash(r[0]);
      let e = byKey.get(key);
      if (!e) { e = { w: r[0], key, score, order: si, hits: [] }; byKey.set(key, e); }
      if (score < e.score) e.score = score;
      if (!e.hits.some((h) => h.srcId === src.id && h.lec === r[2])) {
        e.hits.push({ srcId: src.id, ns: src.ns, lec: r[2], mean: r[1], label: sourceLabel(src, r[2]) });
      }
    }
  });
  return [...byKey.values()]
    .sort((a, b) => a.score - b.score || a.key.length - b.key.length || a.order - b.order || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
    .slice(0, Math.max(1, limit));
}

// 결과 낱말에서 친 글자와 같은 부분을 찾는다(초록으로 칠할 자리). 못 찾으면 null. 영어 검색일 때만 쓴다.
export function matchRange(word, query) {
  if (hasHangul(query)) return null;
  const q = squash(query);
  if (!q) return null;
  const at = String(word || "").toLowerCase().indexOf(q);
  return at < 0 ? null : [at, at + q.length];
}

// [136차수] 뜻 카드용 — 같은 뜻을 가진 책(단원)끼리 묶는다. 뜻이 처음 나온 순서를 지키고, 띄어쓰기만 다른 뜻은 같은 것으로 본다.
//   돌려주는 값: [{ mean: 보여 줄 뜻(처음 나온 것), hits: [그 뜻의 책들…] }]
export function groupHitsByMean(hits) {
  const out = [], at = new Map();
  for (const h of Array.isArray(hits) ? hits : []) {
    if (!h) continue;
    const mean = String(h.mean || "").trim();
    const key = mean.replace(/\s+/g, " ");
    if (!at.has(key)) { at.set(key, out.length); out.push({ mean, hits: [] }); }
    out[at.get(key)].hits.push(h);
  }
  return out;
}

// 네이버 영어사전 검색 주소(새 창으로 연다).
export const naverDictUrl = (word) => `https://en.dict.naver.com/#/search?query=${encodeURIComponent(String(word || "").trim())}`;

// 최근 찾은 단어(이 폰에만 저장, 학생별, 8개까지)
const RECENT_MAX = 8;
const recentKey = (studentId) => `maple_wsearch_recent_${String(studentId || "")}`;
export function readRecentWords(studentId) {
  try {
    const v = JSON.parse(localStorage.getItem(recentKey(studentId)) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string" && x).slice(0, RECENT_MAX) : [];
  } catch (e) { return []; }
}
export function pushRecentWord(studentId, word) {
  const w = String(word || "").trim();
  if (!w) return readRecentWords(studentId);
  const next = [w, ...readRecentWords(studentId).filter((x) => x.toLowerCase() !== w.toLowerCase())].slice(0, RECENT_MAX);
  try { localStorage.setItem(recentKey(studentId), JSON.stringify(next)); } catch (e) {}
  return next;
}
