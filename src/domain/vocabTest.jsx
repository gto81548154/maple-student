import { getSelfAccessToken } from "../core/bundle.jsx";
import { VIDEO_WATCH_API_KEY, VIDEO_WATCH_API_URL } from "../core/config.jsx";

// ─── 주간 오답 복습 규칙 ───
// "그 주(월~일)에 틀린 단어는 → 다음 주 일요일까지 끝낸다"
// 데이터 변경 없이 firstWrongAt + status(active)만으로 계산한다.
const startOfWeekMon = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = x.getDay();                 // 0(일)~6(토)
  x.setDate(x.getDate() + (day === 0 ? -6 : 1 - day)); // 그 주 월요일로
  return x;
};
export const computeVocabReviewWarning = (vocabWrongWords = {}) => {
  const now = new Date();
  const thisWeekStart = startOfWeekMon(now);
  const thisWeekEnd = new Date(thisWeekStart);
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7); // 이번 주 일요일 자정(=다음 월요일 00:00, 미포함)

  let overdue = 0;       // 기한 지남
  let dueThisWeek = 0;   // 이번 주 안에 끝내야 함

  Object.values(vocabWrongWords || {}).forEach((month) => {
    Object.values(month?.words || {}).forEach((w) => {
      if ((w.status || "active") !== "active") return;
      if (!Array.isArray(w.correctAnswers) || w.correctAnswers.length === 0) return;
      const wrongAt = w.firstWrongAt || w.lastWrongAt;
      if (!wrongAt) return;
      const d = new Date(wrongAt);
      if (Number.isNaN(d.getTime())) return;
      // 마감(미포함) = 틀린 주의 월요일 + 14일 = 다음 주 일요일 끝
      const deadline = startOfWeekMon(d);
      deadline.setDate(deadline.getDate() + 14);
      if (deadline <= now) overdue += 1;
      else if (deadline <= thisWeekEnd) dueThisWeek += 1;
    });
  });

  const sunday = new Date(thisWeekEnd);
  sunday.setDate(sunday.getDate() - 1); // 이번 주 일요일
  const dday = Math.max(0, Math.ceil((thisWeekEnd - now) / 86400000));

  return {
    overdue,
    dueThisWeek,
    hasWarning: overdue > 0 || dueThisWeek > 0,
    sundayLabel: `${sunday.getMonth() + 1}/${sunday.getDate()}(일)`,
    dday,
  };
};
// ─── 오답 단어 TEST 결과 저장 API ───
// 학생앱은 AI 채점을 하지 않고, 완료 기록(통과/재시험/정답률)만 Worker로 보낸다.
const VOCAB_TEST_RESULT_API_URL = (() => {
  const explicit = import.meta.env.VITE_VOCAB_TEST_RESULT_API_URL || "";
  if (explicit) return explicit;
  const base = import.meta.env.VITE_MAPL_SYNC_URL || "";
  if (base) return String(base).replace(/\/+$/, "") + "/vocab-test-result";
  // [08-08] 위 두 값이 설정에 없어도 되게 한다.
  // 영상 기록 주소(…/video-watch)의 끝만 바꿔서 쓴다. 같은 워커의 옆 문이라 주소가 항상 같다.
  // 이게 없으면 주소가 빈 문자열이 되어 오답 TEST 결과가 전송조차 안 된다(08-08 발견한 버그).
  const vw = String(VIDEO_WATCH_API_URL || "").replace(/\/+$/, "");
  if (vw) return vw.replace(/\/video-watch$/, "") + "/vocab-test-result";
  return "";
})();
const VOCAB_TEST_PENDING_KEY = "maple_pending_vocab_test_v1";
const VOCAB_PASS_MAX_WRONG_RATE = 0.10;
 // 오답률 10% 이하 통과 (= 정답률 90% 이상)

export function judgeVocabTest(totalCount, wrongCount) {
  const total = Number(totalCount) || 0;
  const wrong = Number(wrongCount) || 0;
  if (total <= 0) return { accuracy: 100, result: "pass" };
  const accuracy = Math.round(((total - wrong) / total) * 100);
  const wrongRate = wrong / total;
  return { accuracy, result: wrongRate <= VOCAB_PASS_MAX_WRONG_RATE ? "pass" : "retest" };
}
const getPendingVocabTests = () => {
  try { return JSON.parse(localStorage.getItem(VOCAB_TEST_PENDING_KEY) || "[]"); }
  catch (e) { return []; }
};
const setPendingVocabTests = (items) => {
  try { localStorage.setItem(VOCAB_TEST_PENDING_KEY, JSON.stringify(items || [])); }
  catch (e) { /* ignore */ }
};
export const makeVocabAttemptId = (studentId, monthKey) =>
  `${studentId}_${monthKey}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const queuePendingVocabTest = (payload) => {
  const pending = getPendingVocabTests();
  const attemptId = payload?.attemptId || `${payload?.studentId || ""}_${payload?.monthKey || ""}_${payload?.completedAt || Date.now()}`;
  if (!pending.some(x => (x.attemptId || "") === attemptId)) {
    pending.push({ ...payload, attemptId });
    setPendingVocabTests(pending.slice(-100));
  }
};
export const postVocabTestResult = async (payload, { queueOnFail = true } = {}) => {
  if (!VOCAB_TEST_RESULT_API_URL) {
    if (queueOnFail) queuePendingVocabTest(payload);
    return false;
  }
  try {
    const headers = { "Content-Type": "application/json" };
    if (VIDEO_WATCH_API_KEY) headers.Authorization = `Bearer ${VIDEO_WATCH_API_KEY}`;
    const resp = await fetch(VOCAB_TEST_RESULT_API_URL, {
      method: "POST",
      headers,
      // [08-08] 본인 확인 값(t)을 보낼 때 붙인다. 대기열에 들어간 옛 기록도 보내는 순간 붙으므로
      //         앱을 바꾸기 전에 쌓인 기록이 버려지지 않는다.
      body: JSON.stringify({ ...payload, t: getSelfAccessToken() }),
    });
    if (!resp.ok) throw new Error(`vocab-test-result 저장 실패: ${resp.status}`);
    return true;
  } catch (e) {
    if (queueOnFail) queuePendingVocabTest(payload);
    return false;
  }
};
// [135차수 j] 보낸 개수를 돌려준다 — 하나라도 보냈으면 부르는 쪽이 자료를 다시 받아 화면에 바로 보이게 한다.
export const flushPendingVocabTests = async () => {
  const pending = getPendingVocabTests();
  if (!pending.length || !VOCAB_TEST_RESULT_API_URL) return 0;
  const failed = [];
  for (const item of pending) {
    const ok = await postVocabTestResult({ ...item, _retry: true }, { queueOnFail: false });
    if (!ok) failed.push(item);
  }
  setPendingVocabTests(failed.slice(-100));
  return pending.length - failed.length;
};
