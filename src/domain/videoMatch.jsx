import { stripLessonSessionPrefix } from "./todo.jsx";

// ─── 영상 매칭 헬퍼 (숙제 텍스트 → 학생의 영상들 매칭) ───
// 사용처: 숙제 항목 옆에 ▶ 버튼 표시 + 인라인 영상 재생
// 숙제/과제 탭 관련 강의 버튼은 원장님이 명시적으로 "수강"이라고 적은 항목에만 표시한다.
// 숙제/과제 탭 관련 강의 버튼은 원장님이 명시적으로 "수강"이라고 적은 항목에만 표시한다.
const VIDEO_TASK_KEYWORDS = ["수강"];
function hasVideoKeyword(text) {
  if (!text) return false;
  return VIDEO_TASK_KEYWORDS.some(kw => text.includes(kw));
}
// 하이픈/언더스코어/콤마를 모두 스페이스로 통일 후 비교
function normalizeForMatch(s) {
  return String(s || "").replace(/[-_,]+/g, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
// 키워드 매칭용: 공백/기호 제거 후 비교
function normalizeKeywordMatchText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^\w가-힣0-9]/g, "")
    .trim();
}
function getVideoMatchKeywords(video = {}) {
  const raw = Array.isArray(video.matchKeywords) ? video.matchKeywords.join(",") : String(video.matchKeywords || "");
  return raw.split(/[,，、/\n]+/g).map(x => x.trim()).filter(Boolean);
}
// 키워드가 책 이름 안에 포함되고 짧으면 그 책에서는 generic 키워드로 본다.
// 예: 책 이름 "천일문-기본", 키워드 "천일문"/"기본" → 모든 UNIT 공통이라 변별력 없음.
const isGenericVideoKeyword = (keyword = "", video = {}) => {
  const kn = normalizeKeywordMatchText(keyword);
  if (!kn) return true;
  const bookNorm = normalizeKeywordMatchText(video.subject || video.bookName || "");
  return bookNorm.includes(kn) && kn.length <= 5;
};
// [0813-2] 교재 이름에 들어 있는 숫자는 회차가 아니다.
// 예) "왓츠리딩-70A"의 70 — 이걸 회차로 세면 그 책 강의가 전부 걸려서
//     "6강 수강"이라고 적어도 5·6·7강이 다 뜨고, 홈 카드가 엉뚱한 강의를 연다.
const stripBookNumbers = (nums = [], video = {}) => {
  const bookNums = new Set(extractTaskNumbers(String(video?.subject || video?.bookName || "")));
  const kept = nums.filter(n => !bookNums.has(n));
  return kept.length ? kept : nums; // 다 빠지면 예전대로(안전)
};
// ─── [0813-3] "챕터2 1 2 3 4 수강" 같은 줄을 제대로 읽기 ────────────────────
// 원장 표기: 앞에 챕터(단원) 번호, 뒤에 그 안의 지문 번호. 곧 챕터2의 1·2·3·4 = 2-1,2-2,2-3,2-4.
// 예전에는 뒤 숫자 1·2·3·4를 "1강·2강·3강·4강"으로 읽어서 챕터1 영상이 떴다.
// 이제 챕터 번호와 뒤 숫자를 붙여 "2-1" 꼴로 만들어, 영상 키워드의 "2-1"과 정확히 맞춘다.
const TASK_LABEL_NUM_RE = /(?:챕터|chapter|ch|유닛|unit|lesson|레슨|day|데이|파트|part)\.?\s*-?\s*(\d{1,4})/gi;
const TASK_NUM_LABEL_RE = /(\d{1,4})\s*(?:강|과|회|장|단원)/g;
// 줄에서 "챕터N" 같은 큰 단위 번호만 뽑는다.
const extractTaskLabelNumbers = (text = "") => {
  const out = []; let m;
  const re = new RegExp(TASK_LABEL_NUM_RE.source, "gi");
  while ((m = re.exec(String(text || "")))) out.push(parseInt(m[1], 10));
  return out;
};
// "챕터2"·"3강" 같은 딱지 붙은 표현을 지운 나머지에서 맨숫자만 뽑는다(교재 숫자는 뺀다).
const extractTaskLooseNumbers = (text = "", video = {}) => {
  const rest = String(text || "")
    .replace(new RegExp(TASK_LABEL_NUM_RE.source, "gi"), " ")
    .replace(new RegExp(TASK_NUM_LABEL_RE.source, "g"), " ");
  const bookNums = new Set(extractTaskNumbers(String(video?.subject || video?.bookName || "")));
  return extractTaskNumbers(rest).filter(n => !bookNums.has(n));
};
// 영상 키워드에서 "2-1" 꼴 짝을 뽑는다.
const extractVideoNumberPairs = (video = {}) => {
  const out = new Set();
  getVideoMatchKeywords(video).forEach(k => {
    const m = String(k).match(/^\s*(\d{1,4})\s*[-–—~]\s*(\d{1,4})\s*$/);
    if (m) out.add(`${parseInt(m[1], 10)}-${parseInt(m[2], 10)}`);
  });
  return out;
};
// 줄이 원하는 "2-1" 짝들.
//  ① 챕터 번호 × 뒤 숫자 (챕터2 1 2 3 4 → 2-1,2-2,2-3,2-4)
//  ② 줄에 "2-1"이라고 그대로 적은 경우도 그대로 인정
const TASK_LITERAL_PAIR_RE = /(?:^|[^\d])(\d{1,4})\s*-\s*(\d{1,4})(?![\d])/g;
const buildTaskNumberPairs = (taskText = "", video = {}) => {
  const out = new Set();
  const labels = extractTaskLabelNumbers(taskText);
  const loose = extractTaskLooseNumbers(taskText, video);
  labels.forEach(L => loose.forEach(n => out.add(`${L}-${n}`)));
  // 교재 이름 부분("왓츠리딩-70A")은 떼고 본다 — 거기 숫자는 회차가 아니다.
  const bookName = String(video?.subject || video?.bookName || "");
  let rest = String(taskText || "");
  if (bookName) rest = rest.split(bookName).join(" ");
  let m; const re = new RegExp(TASK_LITERAL_PAIR_RE.source, "g");
  while ((m = re.exec(rest))) out.add(`${parseInt(m[1], 10)}-${parseInt(m[2], 10)}`);
  return out;
};
// 줄의 "챕터N"이 영상 키워드의 "챕터N"과 같은가(뒤 숫자 없이 "챕터2 수강"만 적었을 때)
const videoMatchesTaskLabel = (video = {}, labelNums = []) => {
  if (!labelNums.length) return false;
  const vids = new Set();
  getVideoMatchKeywords(video).forEach(k => extractTaskLabelNumbers(k).forEach(n => vids.add(n)));
  return labelNums.some(n => vids.has(n));
};
const videoMatchesTaskNumber = (video = {}, taskNumbers = []) => {
  if (!taskNumbers.length) return false;
  const wanted = stripBookNumbers(taskNumbers, video);
  const titleNums = stripBookNumbers(extractTaskNumbers(video.title || ""), video);
  if (titleNums.some(n => wanted.includes(n))) return true;
  const keywordNums = getVideoMatchKeywords(video).flatMap(k => extractTaskNumbers(k));
  return keywordNums.some(n => wanted.includes(n));
};
const countSpecificVideoKeywordMatches = (taskText, video = {}) => {
  const taskNorm = normalizeKeywordMatchText(taskText);
  if (!taskNorm) return 0;
  return getVideoMatchKeywords(video).filter(k => {
    if (isGenericVideoKeyword(k, video)) return false;
    const kn = normalizeKeywordMatchText(k);
    return kn && taskNorm.includes(kn);
  }).length;
};
const NAESIN_VIDEO_HINTS = ["내신", "기말", "중간", "수행평가", "내신콘서트"];
const REGULAR_VIDEO_HINTS = ["구문", "문법", "독해", "단어", "어휘", "천일문", "그래머", "어법끝", "voca", "VOCA"];
const inferTaskArea = (taskText = "") => {
  const t = String(taskText || "");
  const isNaesin = NAESIN_VIDEO_HINTS.some(h => t.includes(h));
  const isRegular = REGULAR_VIDEO_HINTS.some(h => t.includes(h));
  if (isNaesin && !isRegular) return "naesin";
  if (isRegular && !isNaesin) return "regular";
  return null;
};
const inferVideoArea = (video = {}) => {
  const t = `${video.subject || ""} ${video.bookName || ""} ${video.title || ""}`;
  const isNaesin = NAESIN_VIDEO_HINTS.some(h => t.includes(h));
  const isRegular = REGULAR_VIDEO_HINTS.some(h => t.includes(h));
  if (isNaesin && !isRegular) return "naesin";
  if (isRegular && !isNaesin) return "regular";
  return null;
};
// 텍스트에서 숫자 추출 (예: "37 38" → [37, 38], "2,3" → [2, 3])
function extractTaskNumbers(text) {
  const m = (text || "").match(/\d+/g);
  return m ? m.map(n => parseInt(n, 10)).filter(n => n > 0 && n < 10000) : [];
}
const uniqVideosById = (videos = []) => {
  const seen = new Set();
  return (videos || []).filter(v => {
    const key = String(v?.id || `${v?.title || ""}_${v?.url || v?.playlistUrl || ""}`);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};
// ─── [113차수] 강의 번호 읽기 손질 ───
// ① 쪽수·날짜·회독 숫자는 강의 번호가 아니다 → 빼고 읽는다(키워드 비교도 뺀 글로).
//    예) "천일문-기본 11 12 13 14 수강 + 워크북 p.30~31" → 11 12 13 14 (예전엔 UNIT 30·31도 붙을 수 있었다)
//    쪽수 모양: p.30 · 30p · 24~33p · (24~33P) · (94~103)p · (94~103) · 30쪽 · 30페이지 / 날짜: 9/18까지 · 9월 18일 · 18일까지 / 2회독
//    괄호 속 물결 범위 "(94~103)"는 쪽수로 본다(실제 투두에서 늘 쪽수였다). 강의 범위는 괄호 없이 "1~7"로 적는다.
// ② "1~7"은 1 2 3 4 5 6 7로 편다(20개까지). 예) "천일문 기본 1~7 수강" → 예전엔 1강·7강 두 개만 붙었다.
//    "챕터1~3"·"Unit 1~7"처럼 앞에 단원 이름이 붙으면 "챕터1 챕터2 챕터3"으로 편다. "2-1~2-4"처럼 번호 짝에 붙은 물결은 건드리지 않는다.
const TASK_NON_LECTURE_NUM_RES = [
  /\(\s*\d{1,4}\s*[~∼〜]\s*\d{1,4}\s*\)(?:\s*(?:pp?|pg|page)\b)?/gi,      // (94~103) · (94~103)p
  /\(\s*\d{1,4}\s*[\-–]\s*\d{1,4}\s*\)\s*(?:pp?|pg|page)\b/gi,          // (24-33)p — 괄호 속 "2-1"은 번호 짝일 수 있어 p가 붙을 때만
  /\b(?:pp?|pg|page)\.?\s*\d{1,4}(?:\s*[~∼〜\-–]\s*\d{1,4})?/gi,           // p.30 · p30~31
  /\d{1,4}(?:\s*[~∼〜\-–]\s*\d{1,4})?\s*(?:pp?|pg|page)\b/gi,               // 30p · 24~33P
  /\d{1,4}(?:\s*[~∼〜\-–]\s*\d{1,4})?\s*(?:쪽(?!지)|페이지)/g,                // 30쪽 · 30~31페이지 ("8 쪽지시험"은 그대로)
  /\d{1,2}\s*월\s*\d{1,2}\s*일?/g,                                            // 9월 18일
  /\d{1,2}\s*\/\s*\d{1,2}(?=\s*(?:까지|\(|\[|일|$))/g,                      // 9/18까지 · 9/18(금)
  /\d{1,2}\s*일\s*까지/g,                                                       // 18일까지
  /\d{1,2}\s*회독/g,                                                            // 2회독
];
const stripTaskNonLectureNumbers = (text = "") => {
  let s = String(text || "");
  TASK_NON_LECTURE_NUM_RES.forEach(re => { s = s.replace(re, " "); });
  return s;
};
const TASK_RANGE_RE = /(\d{1,4})\s*[~∼〜]\s*(\d{1,4})/g;
const TASK_RANGE_MAX_SPAN = 19;
   // 1~20까지 편다. 더 넓으면 예전처럼 양 끝 숫자만
const TASK_RANGE_LABEL_BEFORE_RE = /(?:^|[^A-Za-z])(챕터|chapter|ch|유닛|unit|lesson|레슨|day|데이|파트|part)\.?\s*-?\s*$/i;
   // "each 1~3"의 ch는 단원 이름이 아니다
const expandTaskRanges = (text = "") => String(text || "").replace(TASK_RANGE_RE, (m, a, b, off, str) => {
  const before = str.charAt(off - 1), after = str.charAt(off + m.length);
  if (/[\d\-–]/.test(before) || /[\d\-–]/.test(after)) return m;   // "2-1~2-4" 같은 짝 범위는 그대로
  const x = parseInt(a, 10), y = parseInt(b, 10);
  if (!(x > 0 && y > x && y - x <= TASK_RANGE_MAX_SPAN)) return m;
  const nums = Array.from({ length: y - x + 1 }, (_, i) => x + i);
  const lm = str.slice(Math.max(0, off - 12), off).match(TASK_RANGE_LABEL_BEFORE_RE);
  if (lm) return nums.map((n, i) => (i === 0 ? String(n) : `${lm[1]}${n}`)).join(" ");   // 챕터1~3 → 챕터1 챕터2 챕터3
  return " " + nums.join(" ") + " ";
});
// "챕터1 1 2 3 4" / "2-1, 2-2" 줄이 강의 몇 개를 적었나 — 챕터 뒤 맨숫자 개수 + 그대로 적은 짝 개수(번호 짝 수보다 많이는 안 붙는다)
const countTaskPairWants = (taskText = "", video = {}) => {
  const labels = extractTaskLabelNumbers(taskText);
  const loose = labels.length ? extractTaskLooseNumbers(taskText, video).length : 0;   // 챕터1 1 2 3 4 챕터2 1 2 3 4 → 8
  const bookName = String(video?.subject || video?.bookName || "");
  let rest = String(taskText || "");
  if (bookName) rest = rest.split(bookName).join(" ");
  const lits = new Set(); let m; const re = new RegExp(TASK_LITERAL_PAIR_RE.source, "g");
  while ((m = re.exec(rest))) lits.add(`${parseInt(m[1], 10)}-${parseInt(m[2], 10)}`);
  return loose + lits.size;
};
// [113차수] 번호로 찾은 강의는 "한 줄에 적은 만큼" 붙인다(예전엔 무조건 4개에서 잘랐다).
//   예) "구문-천일문 핵심 7 8 9 10 11 12 13 수강" → 예전 7~10강만, 이제 7~13강 전부 / "챕터3,챕터4 수강" → 두 챕터 강의 전부
//   · 번호 짝·번호: 줄에 적은 강의 수까지(4개보다 적게 적었으면 예전처럼 4개까지) — 숫자 3개 적은 줄이 강의를 더 끌고 오지 않게
//   · 챕터만 적은 줄: 그 챕터 강의 전부
//   · 어떤 경우든 20개에서 자른다. 키워드·책 전체로 느슨하게 찾는 3·4순위는 예전처럼 4개.
// 돌려주는 via = 어느 규칙으로 찾았나("pair" 번호 짝 · "label" 챕터 · "number" 번호 · "keyword" 키워드 · "book" 책 전체). 홈 강의 목록은 "book"을 뺀다.
const TASK_VIDEO_MATCH_MAX = 20;
const taskVideoCap = (wantCount) => Math.min(TASK_VIDEO_MATCH_MAX, Math.max(4, Number(wantCount) || 0));
// 매칭 메인 함수
// 반환: { hasKeyword, matched, bookCandidates, via }
//   - matchKeywords가 있으면 숙제 문장에 키워드가 포함되는 영상을 1순위로 매칭
//   - 기존 책 이름+숫자 매칭은 fallback으로 유지
export function matchVideosForTask(taskText, studentVideos) {
  taskText = stripLessonSessionPrefix(taskText || "");   // [112차수] 줄 앞 "1차-" "2차-"는 떼고 본다(그 숫자는 강의 번호가 아니다)
  const hasKw = hasVideoKeyword(taskText);
  if (!studentVideos || studentVideos.length === 0) {
    return { hasKeyword: hasKw, matched: [], bookCandidates: [] };
  }

  // "수강"이 없는 숙제/과제 항목은 키워드가 일부 겹쳐도 관련 강의 버튼을 띄우지 않는다.
  if (!hasKw) {
    return { hasKeyword: false, matched: [], bookCandidates: [] };
  }

  // 영역 힌트가 명확하면 영상 풀을 먼저 좁힌다. 모호하면 전체 풀을 그대로 쓴다.
  const taskArea = inferTaskArea(taskText);
  const filteredVideos = taskArea
    ? studentVideos.filter(v => {
        const va = inferVideoArea(v);
        return !va || va === taskArea;
      })
    : studentVideos;

  const taskNorm = normalizeForMatch(taskText);
  const kwText = stripTaskNonLectureNumbers(taskText);            // [113차수] 쪽수·날짜 숫자를 뺀 글 — 키워드 비교용
  const numText = expandTaskRanges(kwText);                       // [113차수] 거기에 "1~7"까지 편 글 — 번호 읽기용
  const taskNumbers = extractTaskNumbers(numText);
  const hadAnyNumber = extractTaskNumbers(taskText).length > 0;   // [113차수] 4순위(책 전체)는 예전처럼 원래 글에 숫자가 있었는지로 정한다

  // 1순위: 책 이름으로 후보를 먼저 좁힌다.
  // "천일문/기본" 같은 공통 키워드가 UNIT 1부터 잡는 문제를 막기 위한 핵심 변경.
  const bookCandidates = uniqVideosById(filteredVideos.filter(v => {
    const subj = normalizeForMatch(v.subject || v.bookName);
    return subj && (taskNorm.includes(subj) || subj.includes(taskNorm));
  }));

  // [0813-3] 1.5순위: "챕터2 1 2 3 4" 처럼 챕터 번호 + 그 안의 지문 번호로 적힌 줄.
  //   ① 챕터와 뒤 숫자를 붙인 "2-1" 짝이 영상 키워드와 정확히 맞으면 그 영상들만.
  //   ② 뒤 숫자가 없어 짝을 못 만들면("챕터2 수강") 챕터 번호만 같은 영상들.
  //   여기서 답이 나오면 아래 맨숫자 매칭으로 내려가지 않는다(1강·2강이 잘못 걸리던 자리).
  if (bookCandidates.length > 0) {
    const wantPairs = buildTaskNumberPairs(numText, bookCandidates[0] || {});
    if (wantPairs.size > 0) {
      const pairMatched = uniqVideosById(bookCandidates.filter(v => {
        const vp = extractVideoNumberPairs(v);
        for (const pr of wantPairs) if (vp.has(pr)) return true;
        return false;
      }));
      if (pairMatched.length > 0) {
        const want = Math.min(wantPairs.size, countTaskPairWants(numText, bookCandidates[0] || {}));
        return { hasKeyword: true, matched: pairMatched.slice(0, taskVideoCap(want)), bookCandidates, via: "pair" };
      }
    }
    const labelNums = extractTaskLabelNumbers(numText);
    if (labelNums.length > 0) {
      const labelMatched = uniqVideosById(bookCandidates.filter(v => videoMatchesTaskLabel(v, labelNums)));
      if (labelMatched.length > 0) return { hasKeyword: true, matched: labelMatched.slice(0, TASK_VIDEO_MATCH_MAX), bookCandidates, via: "label" };
    }
  }

  // 2순위: 과제에 숫자가 있으면, 책 후보 안에서 제목/키워드 숫자가 맞는 영상만 확정한다.
  if (taskNumbers.length > 0 && bookCandidates.length > 0) {
    const numberMatched = uniqVideosById(bookCandidates.filter(v => videoMatchesTaskNumber(v, taskNumbers)));
    if (numberMatched.length > 0) {
      const wantNums = new Set(stripBookNumbers(taskNumbers, bookCandidates[0] || {}));   // [113차수] 줄에 적은 강의 번호 개수(교재 숫자 빼고)
      return { hasKeyword: true, matched: numberMatched.slice(0, taskVideoCap(wantNums.size)), bookCandidates, via: "number" };
    }
  }

  // 3순위: generic을 제외한 구체 키워드(수동태, 관계대명사, UNIT 17 등)만 매칭한다.
  //   [135차수 d] 줄에 책 이름이 적혀 있으면 그 책 안에서만 찾는다 — "문법-그래머존 기초 수강"에 내신 "3과 문법 정리"가 낱말 "문법"으로 걸려 붙던 것을 막는다.
  const keywordPool = bookCandidates.length > 0 ? bookCandidates : filteredVideos;
  const keywordMatched = uniqVideosById(
    keywordPool
      .map(v => ({ ...v, _keywordMatchCount: countSpecificVideoKeywordMatches(kwText, v) }))   // [113차수] 쪽수·날짜 숫자를 뺀 글로
      .filter(v => v._keywordMatchCount > 0)
      .sort((a, b) => (b._keywordMatchCount || 0) - (a._keywordMatchCount || 0) || (a.order || 0) - (b.order || 0))
  );
  if (keywordMatched.length > 0) {
    return { hasKeyword: true, matched: keywordMatched.slice(0, 4), bookCandidates: keywordMatched, via: "keyword" };
  }

  // 4순위: 숫자 없는 과제는 책 후보 전체를 보여준다. 숫자가 있는데 숫자 매칭이 없으면 빈 결과.
  if (bookCandidates.length > 0) {
    const matched = !hadAnyNumber ? bookCandidates : [];
    return { hasKeyword: true, matched: matched.slice(0, 4), bookCandidates, via: matched.length ? "book" : "" };
  }

  return { hasKeyword: true, matched: [], bookCandidates: [] };
}
// ─── [0813] 홈 강의 고르기 창: 시작 강의 하나 + 추가 강의(앞뒤 2개씩) ───
// main = 오늘 숙제 "수강" 강의 중 가장 앞 번호(없으면 마지막 본 강의).
// extras = 시작 강의와 같은 책에서 앞뒤 2개씩 + 나머지 숙제 강의 + 보던 강의, 번호순, 최대 6개.
// [113차수] tasks = 이 날짜 숙제 "수강" 줄에 걸린 강의 전부(겹치면 한 번만 · 먼저 나온 책부터 · 책 안에서는 번호순). 홈 "이어서 할 공부"가 2개 이상이면 강의마다 한 줄씩 보여 준다.
// [113차수] 홈 강의 줄의 "다 봤어요" 기준 — 원장앱 학생기록 영상 칸의 "수강 완료"(80% 이상)와 같게 맞춘다.
export const TASK_VIDEO_DONE_PCT = 80;
// 시청 기록 한 건 → 0~100(반올림 안 함 — 원장앱처럼 79.6%는 아직 "다 봤어요"가 아니다). pct가 없으면 본 시간 ÷ 영상 길이로 셈한다.
export const watchPctOf = (rec) => {
  const r = rec || {};
  const hasPct = r.pct !== null && r.pct !== undefined && r.pct !== "" && Number.isFinite(Number(r.pct));
  const dur = Number(r.durSec);
  const v = hasPct ? Number(r.pct) : (dur > 0 ? ((Number(r.watchSec) || 0) / dur) * 100 : 0);
  return Math.max(0, Math.min(100, Number.isFinite(v) ? v : 0));
};
function videoNumberOf(v) {
  // [0813-2] 제목의 교재 숫자("70A"의 70)를 빼고 진짜 회차만 본다.
  const bookNums = new Set(extractTaskNumbers(String(v?.subject || v?.bookName || "")));
  const all = extractTaskNumbers(String(v?.title || ""));
  const nums = all.filter(n => !bookNums.has(n));
  const use = nums.length ? nums : all;
  return use.length ? use[use.length - 1] : null;
}
// [106차수] 이 날짜 숙제와 실제로 매칭된 강의 id 모음 — 강의 탭 목록의 "오늘 숙제" 배지는 이 안에 있는 영상에만 붙는다(최근 영상이라는 이유로는 안 붙임)
export function collectTaskVideoIds(taskItems, studentVideos) {
  const ids = new Set();
  (taskItems || []).forEach(item => {
    const { matched } = matchVideosForTask(item?.text || "", studentVideos);
    matched.forEach(v => ids.add(v.id));
  });
  return ids;
}
export function buildVideoPickerV2(lastVideo, taskItems, studentVideos) {
  const taskMatched = [];
  const seen = new Set();
  const bookLine = new Map();   // [113차수] 책 → 숙제에서 처음 나온 줄 번호(홈 목록 순서용)
  const listed = new Set();     // [113차수] 홈 목록에 넣을 강의 — 책 이름만 적은 줄("그래머존 기초 수강")로 걸린 강의는 뺀다(어느 강의인지 모르니까)
  (taskItems || []).forEach((item, li) => {
    const { matched, via } = matchVideosForTask(item?.text || "", studentVideos);
    matched.forEach(v => {
      if (!seen.has(v.id)) { seen.add(v.id); taskMatched.push(v); }
      if (via === "book") return;
      listed.add(v.id);
      const bk = String(v.subject || v.bookName || "");
      if (!bookLine.has(bk)) bookLine.set(bk, li);
    });
  });
  taskMatched.sort((a, b) => (videoNumberOf(a) ?? 1e9) - (videoNumberOf(b) ?? 1e9));
  // [113차수] 홈 목록 순서 = 숙제에 먼저 나온 책부터, 같은 책 안에서는 번호순(책이 섞여도 번호끼리 엇갈리지 않게). 시작 강의(main)는 예전 규칙 그대로.
  const bookOrder = v => bookLine.get(String(v.subject || v.bookName || "")) ?? 1e9;
  const tasks = taskMatched.filter(v => listed.has(v.id)).sort((a, b) => bookOrder(a) - bookOrder(b));
  const main = taskMatched[0] ? { video: taskMatched[0], kind: "task" }
    : (lastVideo ? { video: lastVideo, kind: "resume" } : null);
  if (!main) return { main: null, extras: [], tasks };
  const taskIds = new Set(taskMatched.map(v => v.id));
  const subj = main.video.subject || "";
  const sameBook = (studentVideos || [])
    .filter(v => (v.subject || "") === subj && videoNumberOf(v) !== null)
    .sort((a, b) => videoNumberOf(a) - videoNumberOf(b));
  const mi = sameBook.findIndex(v => v.id === main.video.id);
  const pool = mi >= 0 ? sameBook.slice(Math.max(0, mi - 2), mi + 3).filter(v => v.id !== main.video.id) : [];
  taskMatched.forEach(v => { if (v.id !== main.video.id && !pool.some(p => p.id === v.id)) pool.push(v); });
  if (lastVideo && lastVideo.id !== main.video.id && !pool.some(p => p.id === lastVideo.id)) pool.push(lastVideo);
  pool.sort((a, b) => (videoNumberOf(a) ?? 1e9) - (videoNumberOf(b) ?? 1e9));
  const extras = pool.slice(0, 6).map(v => ({ video: v, isTask: taskIds.has(v.id), isResume: !!(lastVideo && v.id === lastVideo.id) }));
  return { main, extras, tasks };
}
// 영상 제목에서 짧은 라벨 추출 (버튼에 표시할 용도)
// 예: "천일문-기본 UNIT 37" → "UNIT 37"
// [135차수 c] "2"·"4"처럼 숫자만 남기거나(뜻이 없음) 같은 이름이 둘 나오던 것(챕터2·챕터2)을 고침:
//   ① "UNIT 12"·"챕터2 2-1"처럼 번호 딱지(뒤에 붙는 2-1 같은 작은 번호까지)가 있으면 그것 ② 없으면 책 이름을 뗀 제목("3과 본문 강의 ① (1~2문단)") ③ 그래도 길면 16자에서 자름
export function getVideoShortLabel(video) {
  const title = String(video.title || "").trim();
  if (!title) return "강의";
  const m = title.match(/(?:UNIT|Unit|unit|Lesson|lesson|LESSON|챕터|Chapter|chapter|CHAPTER|Day|DAY|day)\s*\d+(?:\s+\d{1,2}-\d{1,2})?|\d+강(?:\s+\d{1,2}-\d{1,2})?/);
  if (m) return m[0].replace(/\s+/g, " ");
  let rest = title;
  const subj = String(video.subject || video.bookName || "").trim();
  if (subj && rest.toLowerCase().startsWith(subj.toLowerCase())) rest = rest.slice(subj.length);
  rest = rest.replace(/^[\s\-–—:·]+/, "").trim() || title;
  if (/^\(.+\)$/.test(rest)) rest = rest.slice(1, -1).trim();            // "(재생목록)" → "재생목록"
  if (rest.length > 16) {
    const cut = rest.indexOf(" (");                                          // 길면 괄호 설명부터 뗀다: "3과 본문 강의 ① (1~2문단)" → "3과 본문 강의 ①"
    if (cut >= 4) rest = rest.slice(0, cut).trim();
    if (rest.length > 16) rest = rest.slice(0, 15) + "…";
  }
  return rest;
}
export function extractYoutubeId(url) {
  if (!url) return "";
  let m = url.match(/youtu\.be\/([^?&]+)/);
  if (m) return m[1];
  m = url.match(/[?&]v=([^?&]+)/);
  if (m) return m[1];
  m = url.match(/embed\/([^?&]+)/);
  if (m) return m[1];
  return "";
}
export function extractPlaylistId(url) {
  if (!url) return "";
  const m = url.match(/[?&]list=([^?&]+)/);
  return m ? m[1] : "";
}
