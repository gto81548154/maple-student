import { teacherUrl } from "../core/auth.jsx";

// ─── [교사 열람 모드 2026-08-27] 선생님 전용 홈 ─────────────────────────
// 탭 4개 = 내 할일 · 학생 · 강의 · 단어장
//   내 할일 : 원장앱 "직원 할일"의 내 카드 그대로 (체크는 여기서 할 수 있다) + 오늘의 숙제단어
//   학생    : 그날 수업하는 학생 목록 (◀▶ 로 다른 날도 미리 볼 수 있음) → 누르면 그 학생 화면(읽기 전용)
//   강의    : 커리큘럼에 등록된 전 교재 강의 (배정과 무관) — 수업 준비용 PDF 모음집은 다음 차수
//   단어장  : 마플보카 — 진도는 __teacher__{계정id}로 저장돼 학생 진도와 절대 안 섞인다
// 열쇠(tid·tk)는 주소에 있고, 진짜인지는 워커가 판정한다. 403이 오면 폰의 열쇠를 지우고 안내 화면으로 나간다.
// ═══════════════════════════════════════════════════════════════════
// [115차수 09-26 토익] 원장 링크 전용 "토익" 탭 — 원장 개인 공부(ETS 기출 1000제 1~4권)
//   파일은 R2 toeic/ 칸(워커가 원장 링크 열쇠로만 연다), 기록은 워커 /teacher/toeic(toeic3)에 저장.
//   선생님 화면에는 탭도, 홈 카드도 안 나온다(home.isOwner일 때만).
// ═══════════════════════════════════════════════════════════════════
export const TOEIC_BOOKS = [3, 2, 1, 4];
   // 푸는 순서(원장과 정한 순서 3→2→1→4)
export const TOEIC_TESTS = Array.from({ length: 10 }, (_, i) => String(i + 1).padStart(2, "0"));
export const toeicId = (v, part, nn) => `v${v}-${part}-${nn}`;
export const parseToeicId = (id) => {
  const m = /^v(\d)-(lc|rc)-(\d\d)$/.exec(String(id || ""));
  return m ? { v: Number(m[1]), part: m[2], nn: m[3] } : null;
};
export const toeicFileUrl = (v, part, nn, kind) => {
  const tail = kind === "mp3" ? `test${nn}.mp3` : `test${nn}-${kind}.pdf`;   // kind: mp3 | q(문제지) | a(해설)
  return teacherUrl(`/files/toeic/ets1000/v${v}/${part}/${tail}`);
};
// 다음에 풀 LC 회차 — 마지막으로 연 LC가 안 끝났으면 그것, 아니면 순서대로 첫 미완료
export const toeicNextLc = (tests) => {
  const t = tests || {};
  let last = "";
  let lastAt = "";
  Object.entries(t).forEach(([id, r]) => {
    const p = parseToeicId(id);
    if (p && p.part === "lc" && r && r.openedAt && r.openedAt > lastAt) { lastAt = r.openedAt; last = id; }
  });
  if (last && !(t[last] && t[last].done)) return last;
  for (const v of TOEIC_BOOKS) for (const nn of TOEIC_TESTS) {
    const id = toeicId(v, "lc", nn);
    if (!(t[id] && t[id].done)) return id;
  }
  return toeicId(TOEIC_BOOKS[0], "lc", "01");
};
export const toeicDoneCount = (tests, v, part) => TOEIC_TESTS.filter(nn => tests && tests[toeicId(v, part, nn)] && tests[toeicId(v, part, nn)].done).length;
export const fmtClock = (sec) => {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, "0")}`;
};
export const TOEIC_P5_TYPES = ["전체", "어휘", "품사", "전치사·접속사", "동사 형태", "대명사", "기타 문법"];
const toeicP5Order = (q) => TOEIC_BOOKS.indexOf(q.v) * 10000 + q.t * 1000 + q.n;
export const pickToeicP5 = (all, rec, type, count = 5, skip = []) => {
  const pool = (all || []).filter(q => (type === "전체" || q.type === type) && !skip.includes(q.id));
  const wrong = pool.filter(q => rec[q.id] && rec[q.id].last === "X").sort((a, b) => toeicP5Order(a) - toeicP5Order(b));
  const fresh = pool.filter(q => !rec[q.id]).sort((a, b) => toeicP5Order(a) - toeicP5Order(b));
  const seen = pool.filter(q => rec[q.id] && rec[q.id].last !== "X")
    .sort((a, b) => ((rec[a.id].r || 0) - (rec[b.id].r || 0)) || (toeicP5Order(a) - toeicP5Order(b)));
  const out = [...wrong.slice(0, 2)];
  for (const q of [...fresh, ...wrong.slice(2), ...seen]) { if (out.length >= count) break; if (!out.includes(q)) out.push(q); }
  return out;
};
export const toeicP5Stats = (rec) => {
  const vals = Object.values(rec || {});
  return { done: vals.length, wrongNow: vals.filter(x => x && x.last === "X").length };
};
