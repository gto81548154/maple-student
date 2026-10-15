
// 진도 맵·강의 영상의 교재명에서 이 학생이 배우는 단어장을 추정한다. (정규 커리큘럼 연동)
// 매칭되는 책이 하나도 없으면 전체(원장 전용 제외)를 보여준다 — 새 학생도 막히지 않게.
const VOCA_BOOK_MATCHERS = [
  { id: "wm_sn",    re: /워(드)?\s*마(스터)?[^\n]*수능/ },
  { id: "wm_basic", re: /워(드)?\s*마(스터)?[^\n]*(basic|베이직)/i },
  { id: "wm_hi",    re: /하이스트/ },
  { id: "ve_ess",   re: /어휘끝[^\n]*필수/ },
  { id: "ve_adv",   re: /어휘끝[^\n]*고난도/ },
  { id: "ve_ety",   re: /어원편/ },
];
// ─── [0813] 홈 "수업 단어 공부" 카드: 오늘 숙제에서 단어장 범위 읽기 ───
// [0814] 책 이름표는 이 표 한 곳에만 둔다 — full은 크게 쓰는 정식 이름(마플보카 책장 제목과 같게),
//        short는 좁은 카드에서 쓰는 줄임말. 이름을 고칠 일이 생기면 여기만 고치면 된다.
const VOCA_BOOK_LABELS = {
  wm_sn:     { full: "워드마스터 수능 2000",  short: "워마 수능" },
  wm_basic:  { full: "워드마스터 고등 Basic", short: "워마 Basic" },
  wm_hi:     { full: "워드마스터 하이스트",   short: "하이스트" },
  ve_ess:    { full: "어휘끝 중학 필수",      short: "어휘끝 필수" },
  ve_adv:    { full: "어휘끝 중학 고난도",    short: "어휘끝 고난도" },
  ve_ety:    { full: "어휘끝 어원편",         short: "어원편" },
  vocabible: { full: "보카바이블 A·B",        short: "보카바이블" },
};
export const vocaFullLabel = (id) => (VOCA_BOOK_LABELS[id] ? VOCA_BOOK_LABELS[id].full : "");
export const vocaShortLabel = (id) => (VOCA_BOOK_LABELS[id] ? VOCA_BOOK_LABELS[id].short : "단어장");
export const VOCA_UNIT_WORDS = { wm_sn: "DAY", wm_basic: "DAY", wm_hi: "DAY", ve_ess: "UNIT", ve_adv: "UNIT", ve_ety: "DAY" };
// 숙제 항목에서 "단어-워마 수능 25 26 27 28" 같은 줄을 찾아 { book, lecs }로 돌려준다.
// 책 이름이 잡히고 1~60 사이 숫자가 있는 첫 줄을 쓴다. 없으면 null. (2000 같은 큰 숫자는 걸러짐)
// [0813 검토수정] ① "25~28" 같은 물결표(및 붙임표) 범위를 26·27까지 펼쳐서 읽는다
//                ② "3회독"·"10개"처럼 단원이 아닌 숫자는 먼저 지우고 읽는다
const VOCA_NOISE_NUMBER = /\d+\s*(회독|회씩|회|개씩|개|문제|문항|일차|일|쪽|페이지|주차|분|차|번씩)/g;
const VOCA_RANGE_MARK = /(\d+)\s*[~∼〜～\-–—]\s*(\d+)/g;
function parseVocaLecs(text) {
  const cleaned = String(text || "").replace(VOCA_NOISE_NUMBER, " ");
  const out = [];
  // 범위를 먼저 펼친다. 범위로 보기 어려우면 그대로 두고 아래에서 낱개로 읽는다.
  const rest = cleaned.replace(VOCA_RANGE_MARK, (whole, a, b) => {
    const s = parseInt(a, 10), e = parseInt(b, 10);
    if (s >= 1 && e >= 1 && s <= 60 && e <= 60 && e >= s && e - s <= 40) {
      for (let n = s; n <= e; n++) out.push(n);
      return " ";
    }
    return whole;
  });
  (rest.match(/\d+/g) || []).forEach(t => {
    const n = parseInt(t, 10);
    if (n >= 1 && n <= 60) out.push(n);
  });
  return [...new Set(out)].sort((a, b) => a - b);
}
// ─── [내신 4차수] 내신 앱 단어 숙제 줄 읽기 ───
// 투두 줄 예: "내신-하남고1-YBM 5~6과 앱 단어 통과" → 5과·6과.
// 교재 이름에 붙은 숫자("하남고1"의 1, "미사중2"의 2)를 단원으로 잘못 읽지 않도록,
// 숫자 바로 뒤가 "과"·"강"이거나 물결표·쉼표로 이어지는 덩어리만 읽는다.
const NAESIN_APP_VOCA_RE = /앱\s*단어/;
const NAESIN_LESSON_RE = /(\d+(?:\s*[~\u223c\u301c\uff5e\-\u2013\u2014]\s*\d+)?(?:\s*,\s*\d+(?:\s*[~\u223c\u301c\uff5e\-\u2013\u2014]\s*\d+)?)*)\s*(?:과|강)/g;
function parseNaesinLessons(text) {
  const head = String(text || "").split(NAESIN_APP_VOCA_RE)[0];
  let last = null, m;
  NAESIN_LESSON_RE.lastIndex = 0;
  while ((m = NAESIN_LESSON_RE.exec(head))) last = m[1];   // 맨 뒤 덩어리 = 진짜 범위
  if (!last) return [];
  const out = [];
  const rest = String(last).replace(VOCA_RANGE_MARK, (whole, a, b) => {
    const s = parseInt(a, 10), e = parseInt(b, 10);
    if (s >= 1 && e >= s && e <= 30 && e - s <= 20) { for (let k = s; k <= e; k++) out.push(k); return " "; }
    return whole;
  });
  (rest.match(/\d+/g) || []).forEach(t => { const v = parseInt(t, 10); if (v >= 1 && v <= 30) out.push(v); });
  return [...new Set(out)].sort((a, b) => a - b);
}
// ─── [0814] 원장앱 교재 이름·별칭으로 단어장 찾기 ───
// 원장앱 "교재 설정"의 교재명과 별칭(줄임말)은 진도 맵(ptree3) 안에 그대로 들어 있다.
// 교재명(또는 별칭)이 위 기본 규칙에 걸리면, 그 교재의 별칭을 전부 같은 단어장으로 등록한다.
// → 원장이 별칭을 새로 넣어도 앱을 다시 고칠 필요가 없다.
// 비교할 때는 띄어쓰기·붙임표를 지운다. "단어-중학-고난도"와 "단어 중학-고난도"를 같은 것으로 본다.
const VOCA_SEP_CHARS = "\\s\\-–—_.·ㆍ・/";
const VOCA_SEP_RE = new RegExp("[" + VOCA_SEP_CHARS + "]+", "g");
const VOCA_SEP_ONE = new RegExp("[" + VOCA_SEP_CHARS + "]");
const normVocaName = (s) => String(s || "").toLowerCase().replace(VOCA_SEP_RE, "");
// 지운 글자 때문에 자리가 밀리므로, 남은 글자가 원래 몇 번째였는지도 같이 적어 둔다.
// (뒤에서 교재 이름 부분만 정확히 도려내기 위함 — 교재 이름 속 숫자가 단원으로 세어지면 안 된다)
function normVocaWithMap(text) {
  const src = String(text || "");
  let norm = ""; const map = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (VOCA_SEP_ONE.test(ch)) continue;
    norm += ch.toLowerCase(); map.push(i);
  }
  return { src, norm, map };
}
// 진도 맵을 훑어 [{ book, key }] 목록을 만든다. key는 띄어쓰기·붙임표를 지운 이름.
export function buildVocaAliasIndex(progressTree) {
  const out = []; const seen = new Set();
  (progressTree?.lanes || []).forEach((l) => (l.nodes || []).forEach((n) => {
    const names = [String(n?.name || ""), ...String(n?.alias || "").split(",")]
      .map(v => String(v).trim()).filter(Boolean);
    if (!names.length) return;
    let book = "";
    for (const nm of names) {
      const m = VOCA_BOOK_MATCHERS.find(mm => mm.re.test(nm));
      if (m) { book = m.id; break; }
    }
    if (!book) return;   // 단어장이 아닌 교재(독해·구문·문법)는 건너뛴다
    names.forEach(nm => {
      const key = normVocaName(nm);
      if (key.length < 3) return;   // 너무 짧은 별칭은 엉뚱한 줄에 걸릴 수 있어 쓰지 않는다
      const tag = book + "|" + key;
      if (seen.has(tag)) return;
      seen.add(tag);
      out.push({ book, key });
    });
  }));
  out.sort((a, b) => b.key.length - a.key.length);   // 긴 이름부터 찾는다
  return out;
}
// 숙제 줄에서 교재 이름·별칭을 찾는다. rest = 그 이름을 도려낸 나머지 글자.
function matchVocaAliasInText(text, aliasIndex) {
  if (!aliasIndex || !aliasIndex.length) return null;
  const { src, norm, map } = normVocaWithMap(text);
  if (!norm) return null;
  for (const item of aliasIndex) {
    const pos = norm.indexOf(item.key);
    if (pos < 0) continue;
    const from = map[pos], to = map[pos + item.key.length - 1];
    return { book: item.book, rest: src.slice(0, from) + " " + src.slice(to + 1) };
  }
  return null;
}
// [0814] 찾는 순서 ① 원장앱 교재명·별칭이 먼저 ② 못 찾으면 예전 기본 규칙을 쓰되
//        "단어"라고 적힌 줄만 본다(안 그러면 "독해-자이-고난도" 같은 줄을 단어장으로 잘못 읽는다).
export function findTaskVocaRange(taskItems, aliasIndex) {
  for (const item of (taskItems || [])) {
    const text = String(item?.text || "");
    if (NAESIN_APP_VOCA_RE.test(text)) {                    // [내신 4차수] "… 5~6과 앱 단어 통과"
      const lessons = parseNaesinLessons(text);             // 책과 유닛은 마플보카가 학교표를 보고 정한다
      if (lessons.length) return { ns: true, lessons };
      continue;
    }
    const hit = matchVocaAliasInText(text, aliasIndex);
    if (hit) {
      const lecs = parseVocaLecs(hit.rest);
      if (lecs.length) return { book: hit.book, lecs };
      continue;
    }
    if (!/단어/.test(text)) continue;
    const m = VOCA_BOOK_MATCHERS.find(mm => mm.re.test(text));
    if (!m) continue;
    const lecs = parseVocaLecs(text);
    if (!lecs.length) continue;
    return { book: m.id, lecs };
  }
  return null;
}
// 단원 묶음을 짧은 글로 — 이어지면 "25~28", 띄엄띄엄이면 "25·27·30"
export function fmtLecRange(lecs) {
  if (!lecs || !lecs.length) return "";
  const contiguous = lecs.every((n, i) => i === 0 || n === lecs[i - 1] + 1);
  if (contiguous && lecs.length > 1) return `${lecs[0]}~${lecs[lecs.length - 1]}`;
  return lecs.join("·");
}
export const guessVocaBooks = (progressTree, videos) => {
  const texts = [];
  (progressTree?.lanes || []).forEach((l) => {
    texts.push(String(l.name || l.label || l.book || ""));
    (l.nodes || []).forEach((n) => texts.push(String(n.label || n.title || n.name || "")));
  });
  (videos || []).forEach((v) => texts.push(String(v.subject || "")));
  const blob = texts.join("\n");
  return VOCA_BOOK_MATCHERS.filter((m) => m.re.test(blob)).map((m) => m.id);
};
