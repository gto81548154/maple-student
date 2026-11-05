import { IS_STAFF_VIEW } from "../core/auth.jsx";
import { nearestExamOf } from "../domain/dday.jsx";
import { fmtDateShort } from "../domain/time.jsx";
import { VOCA_UNIT_WORDS, fmtLecRange, vocaShortLabel } from "../domain/voca.jsx";

// ═══ [147차수] 앱을 켤 때 가운데 뜨는 안내 카드 — 어떤 카드를 띄울지 정한다 ═══
//   전부 이미 받은 자료로 만든다(서버 추가 요청 없음). 순서 = 급한 것부터:
//     ⓪ 단어 숙제 아직 안 함([153차수]) → ① 기한 지난 오답 단어 → ② 이번 주까지 통과할 오답 단어 → ③ 응답 안 한 설문 → ④ 7일 안 시험 → ⑤ 새 고정 공지(한 번만) → ⑥ 원장이 올린 카드(popups, 워커가 주면)
//   "오늘 하루 안 보기"를 누르면 그날은 다시 안 뜬다(폰 저장). 선생님·원장 보기 화면에서는 안 띄운다.
const STORE_KEY = "home_popup_v1";
const readStore = () => { try { const j = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); return j && typeof j === "object" ? j : {}; } catch (e) { return {}; } };
const writeStore = (s) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} };
// 오늘 하루 안 보기 — 지금 뜬 카드들의 키를 오늘 날짜와 함께 기억
export const hideHomePopupToday = (todayStr, keys) => { const s = readStore(); writeStore({ ...s, hideDate: todayStr, hideKeys: Array.isArray(keys) ? keys : [] }); };
// 공지 카드는 한 공지당 한 번만 — 본 공지 키 기억(최근 50개)
const markNoticesSeen = (keys) => { if (!keys.length) return; const s = readStore(); const seen = Array.isArray(s.seenNotices) ? s.seenNotices : []; writeStore({ ...s, seenNotices: [...new Set([...seen, ...keys])].slice(-50) }); };
// [153차수] 단어 숙제 범위 글 — 홈 "지금 폰으로 할 공부" 단어 줄과 같은 모양("워마 수능 DAY 33~35", "내신 단어 3~4과")
export const vocaHwRangeText = (taskVoca) => !taskVoca ? "" : taskVoca.ns
  ? `내신 단어 ${fmtLecRange(taskVoca.lessons)}과`
  : `${vocaShortLabel(taskVoca.book)} ${VOCA_UNIT_WORDS[taskVoca.book] || "DAY"} ${fmtLecRange(taskVoca.lecs)}`;
const truncate = (t, n) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

export function computeHomePopup(D) {
  const { activeDate, examDdays, pinnedMessages, popups, taskVoca, todayStr, unansweredSurveys, vocaHwKnown, vocaHwRec, vocabWarn, wrongCount } = D;
  if (IS_STAFF_VIEW) return [];
  const store = readStore();
  const hidden = new Set(store.hideDate === todayStr && Array.isArray(store.hideKeys) ? store.hideKeys : []);
  const seenNotices = new Set(Array.isArray(store.seenNotices) ? store.seenNotices : []);
  const cards = [];
  // ⓪ [153차수] 단어 숙제 아직 안 함 — 다음(또는 오늘) 수업 숙제에 앱 단어가 있고, 도장 확인이 끝났는데 도장이 없을 때만. 지난 숙제는 안 띄운다.
  //   단추 → 단어 탭(숙제가 남아 있으면 단어 탭이 숙제 TEST부터 연다). 열쇠에 수업 날짜가 들어가 "오늘 하루 안 보기"도 그 숙제 기준.
  if (taskVoca && vocaHwKnown && !vocaHwRec && activeDate && activeDate >= todayStr) {
    const when = activeDate === todayStr ? "오늘 수업 전까지" : `${fmtDateShort(activeDate)} 수업 전까지`;
    cards.push({ key: "vocahw-" + activeDate, tone: "warn", icon: "📘", title: "단어 숙제를 아직 안 했어요",
      body: `${vocaHwRangeText(taskVoca)}\n${when} 숙제 TEST를 통과해요.`, cta: "숙제 TEST 시작", tab: "voca" });
  }
  // ① ② 오답 단어
  if (vocabWarn && vocabWarn.overdue > 0) {
    cards.push({ key: "vocab-overdue", tone: "warn", icon: "⏰", title: "기한이 지난 단어가 있어요",
      body: `틀린 단어 ${vocabWarn.overdue}개 · ${vocabWarn.overdueSundayLabel || "지난주"}까지였어요.\n지금 복습해서 통과하면 돼요.`, cta: "지금 복습하기", tab: "vocabWrong" });
  } else if (vocabWarn && vocabWarn.dueThisWeek > 0) {
    cards.push({ key: "vocab-due", tone: "navy", icon: "📝", title: `틀린 단어 ${vocabWarn.dueThisWeek}개, 이번 주까지!`,
      body: `${vocabWarn.sundayLabel}까지 통과해야 해요 (D-${vocabWarn.dday}).${wrongCount > vocabWarn.dueThisWeek ? `\n전체 남은 단어는 ${wrongCount}개예요.` : ""}`, cta: "복습하러 가기", tab: "vocabWrong" });
  }
  // ③ 설문
  const svs = Array.isArray(unansweredSurveys) ? unansweredSurveys : [];
  if (svs.length) {
    const first = svs[0];
    cards.push({ key: "survey-" + svs.map((s) => s.id).join(","), tone: "navy", icon: "🗳️", title: svs.length === 1 ? "설문이 기다리고 있어요" : `설문 ${svs.length}개가 기다리고 있어요`,
      body: `${truncate(first.title, 40)}${svs.length > 1 ? ` 외 ${svs.length - 1}개` : ""}${first.endDate ? `\n${String(first.endDate).slice(5).replace("-", "/")}까지 응답해 주세요` : ""}`, cta: "응답하기", tab: "notices" });
  }
  // ④ 7일 안 시험(내신 우선, 가장 가까운 것)
  const exam = nearestExamOf(examDdays);
  if (exam && typeof exam.diff === "number" && exam.diff >= 0 && exam.diff <= 7) {
    cards.push({ key: `exam-${exam.id}-${exam.ddayLabel}`, tone: "navy", icon: "📋", title: `${exam.name} ${exam.ddayLabel}`,
      body: `${exam.dateLabel}${exam.isEngTarget ? " · 영어 시험일 기준" : ""}\n시험 범위를 한 번 더 확인해요.`, cta: "시험 정보 보기", tab: "examInfo" });
  }
  // ⑤ 새 고정 공지 — 아직 카드로 안 보여 준 것만, 가장 최근 1개
  const pm = Array.isArray(pinnedMessages) ? pinnedMessages : [];
  const fresh = pm.find(([dateKey, rec]) => rec && !seenNotices.has(dateKey));
  const noticeKeysToMark = fresh ? [fresh[0]] : [];
  if (fresh) {
    const [dateKey, rec] = fresh;
    cards.push({ key: "notice-" + dateKey, tone: "navy", icon: "📣", title: "새 공지가 있어요", body: truncate(rec.text, 70), cta: "공지 보기", tab: "notices" });
  }
  // ⑥ 원장이 올린 카드(워커 popups) — 기간 안의 것만
  (Array.isArray(popups) ? popups : []).forEach((p) => {
    if (!p || !p.id || !p.title) return;
    if (p.startDate && todayStr < String(p.startDate).slice(0, 10)) return;
    if (p.endDate && todayStr > String(p.endDate).slice(0, 10)) return;
    cards.push({ key: "custom-" + p.id, tone: "navy", icon: p.icon || "🎉", title: truncate(p.title, 40), body: truncate(p.body, 120), image: p.image || "", cta: p.button || "", tab: p.tab || "", url: p.url || "" });
  });
  const out = cards.filter((c) => !hidden.has(c.key)).slice(0, 5);
  if (out.some((c) => c.key.startsWith("notice-"))) markNoticesSeen(noticeKeysToMark);
  return out;
}
