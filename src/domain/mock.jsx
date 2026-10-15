
// ─── [모의고사 4차수 2·3·4단계] 모의고사 탭 — 회차 목록 → 회차 메뉴 → 듣기·시계 → 답 입력 → 결과 ───
// 회차는 워커 POST /mock/rounds 가 내려준다: 원장님이 잠갔고 + 정답 45개가 다 찬 + 이 학생 학년의 회차만.
// 정답·3점 정보는 이 화면까지 절대 내려오지 않는다 (제출한 뒤 결과 응답에만 들어옴).
// 시험 시계 규칙(원장 확정): 듣기 재생 = 70분 / 듣기 없이 시작 = 50분(듣기 제외) /
//   남은 시간이 아니라 "시작 시각"을 폰에 저장해서 앱을 껐다 켜도 시간이 계속 흐른다 /
//   시험이 도는 동안 답 입력은 잠긴다 / [시험 끝내기]로 일찍 끝낼 수 있다 /
//   답 입력(4단계)은 시계 없이도 들어갈 수 있다 — 종이로 이미 푼 학생용.
export const MOCK_NOTE_COLORS = { "모평": { bg: "#f3e8ff", fg: "#7c3aed" }, "수능": { bg: "#fdf2f8", fg: "#e84393" } };
export const fmtMockAttemptDate = (iso) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return `${d.getMonth() + 1}/${d.getDate()}`;
};
// ── [모의고사 시계 순수부 시작] 시계 계산 — 시험(검증)도 이 구간을 그대로 떼어 돌린다 ──
const MOCK_EXAM_MIN = { timed70: 70, timed50: 50 };
 // 듣기 포함 70분 / 듣기 없이 50분

export const mockExamDurationMin = (mode) => MOCK_EXAM_MIN[mode] || 0;
// 남은 시간(밀리초). 시작 시각 기준으로 계산하므로 앱을 껐다 켜도 이어진다. 0 밑으로 안 내려감.
export const mockExamRemainingMs = (startedAt, mode, now) => {
  const total = mockExamDurationMin(mode) * 60 * 1000;
  const left = (Number(startedAt) || 0) + total - (Number(now) || 0);
  return Math.max(0, Math.min(total, left));
};
// 70:00 / 9:05 / 0:00 모양 시계 표시
export const fmtMockClock = (ms) => {
  const sec = Math.max(0, Math.ceil((Number(ms) || 0) / 1000));
  const m = Math.floor(sec / 60), s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
};
// 재생 속도: 0.5~2.0 사이, 0.1 단위 (소수점 오차 방지 반올림)
export const mockClampSpeed = (v) => Math.min(2, Math.max(0.5, Math.round((Number(v) || 1) * 10) / 10));
// ── [모의고사 시계 순수부 끝] ──

// 진행 중인 시험은 폰(localStorage)에 시작 시각째로 저장한다 — 학생당 한 번에 한 시험.
const mockExamStateKey = (studentId) => `maple_mock_active_${studentId}`;
export const loadMockExamState = (studentId) => {
  try {
    const r = JSON.parse(localStorage.getItem(mockExamStateKey(studentId)) || "null");
    if (r && r.v === 1 && r.roundId && r.startedAt && (r.phase === "running" || r.phase === "done")) return r;
  } catch (e) { /* 망가진 저장값은 없는 셈 친다 */ }
  return null;
};
export const saveMockExamState = (studentId, st) => {
  try {
    if (st) localStorage.setItem(mockExamStateKey(studentId), JSON.stringify(st));
    else localStorage.removeItem(mockExamStateKey(studentId));
  } catch (e) { /* 저장 실패해도 시험 진행은 막지 않는다 */ }
};
export const mockSpeedKey = (studentId) => `maple_mock_speed_${studentId}`;
export const loadMockSpeed = (studentId) => {
  try { return mockClampSpeed(Number(localStorage.getItem(mockSpeedKey(studentId))) || 1); } catch (e) { return 1; }
};
export const mockRoundTitle = (r) => `${r.year}년 ${r.month}월 · 고${r.grade}`;
// ── [모의고사 답입력 순수부 시작] 쪽 나눔·검산 계산 — 시험(검증)도 이 구간을 그대로 떼어 돌린다 ──
// 쪽 나눔은 원장앱 정답 등록(C안)과 완전히 같다: 1~12 / 13~20 / 21~24 / 25~28 / 29~32 / 33~36 / 37~40 / 41~45
const MOCK_PAGES = [[1, 12], [13, 20], [21, 24], [25, 28], [29, 32], [33, 36], [37, 40], [41, 45]];
// 듣기 제외면 18번부터: 1쪽(1~12)은 통째로 빠지고 2쪽은 18~20만 남아 총 7쪽이 된다
export const mockPagesFor = (noListening) => {
  if (!noListening) return MOCK_PAGES;
  return MOCK_PAGES.map(([a, b]) => [Math.max(a, 18), b]).filter(([a, b]) => a <= b);
};
const isMockPick = (v) => Number.isInteger(Number(v)) && Number(v) >= 1 && Number(v) <= 5;
// 이 쪽에서 아직 안 찍은 번호들
export const mockPageMissing = (answers, page) => {
  const miss = [];
  for (let n = page[0]; n <= page[1]; n++) if (!isMockPick((answers || [])[n - 1])) miss.push(n);
  return miss;
};
// 입력해야 하는 전체 범위에서 안 찍은 번호들
export const mockAllMissing = (answers, noListening) => {
  const miss = [];
  for (let n = noListening ? 18 : 1; n <= 45; n++) if (!isMockPick((answers || [])[n - 1])) miss.push(n);
  return miss;
};
// 번호별 개수: ①8개 ②9개… — 밀려 찍으면 한쪽으로 쏠려서 학생이 스스로 알아챈다
export const mockCountByChoice = (answers, noListening) => {
  const c = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (let n = noListening ? 18 : 1; n <= 45; n++) {
    const v = Number((answers || [])[n - 1]);
    if (c[v] != null) c[v]++;
  }
  return c;
};
// 끝난 시험 기록에서 걸린 시간(초) — 자유 입력이면 0
export const mockDurationSecFromExam = (exam) => {
  if (!exam || exam.phase !== "done") return 0;
  const ms = (Number(exam.endedAt) || 0) - (Number(exam.startedAt) || 0);
  return Math.max(0, Math.round(ms / 1000));
};
// ── [모의고사 답입력 순수부 끝] ──

// 찍다 만 답은 폰에 임시 저장 — 전화가 와서 앱이 꺼져도 이어서 찍는다. 제출하면 지운다.
const mockDraftKey = (studentId) => `maple_mock_draft_${studentId}`;
export const loadMockDraft = (studentId, roundId, noListening) => {
  try {
    const r = JSON.parse(localStorage.getItem(mockDraftKey(studentId)) || "null");
    if (r && r.v === 1 && r.roundId === roundId && !!r.noListening === !!noListening && Array.isArray(r.answers)) return r;
  } catch (e) { /* 망가진 저장값은 없는 셈 친다 */ }
  return null;
};
export const saveMockDraft = (studentId, draft) => {
  try {
    if (draft) localStorage.setItem(mockDraftKey(studentId), JSON.stringify(draft));
    else localStorage.removeItem(mockDraftKey(studentId));
  } catch (e) { /* 무시 */ }
};
export const MOCK_CIRCLED = { 1: "①", 2: "②", 3: "③", 4: "④", 5: "⑤" };
