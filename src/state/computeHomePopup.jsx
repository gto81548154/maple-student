import { IS_STAFF_VIEW } from "../core/auth.jsx";
import { nearestExamOf } from "../domain/dday.jsx";
import { fmtYMD } from "../domain/time.jsx";

// ═══ [147차수] 앱을 켤 때 가운데 뜨는 안내 카드 — 어떤 카드를 띄울지 정한다 ═══
//   전부 이미 받은 자료로 만든다(서버 추가 요청 없음). 순서 = 급한 것부터:
//     ① 기한 지난 오답 단어 → ② 이번 주까지 통과할 오답 단어 → ③ 응답 안 한 설문 → ④ 7일 안 시험 → ⑤ 공지(가장 최근 1개) → ⑥ 원장이 올린 카드(popups, 워커가 주면)
//   "오늘 하루 안 보기"를 누르면 그날은 다시 안 뜬다(폰 저장). 선생님·원장 보기 화면에서는 안 띄운다.
//   [163차수 원장 결정 11-11] 공지 카드는 "앞으로 안 보기"를 눌러야만 사라진다. 닫기·바깥 누르기로 끄면 다음에 앱을 켤 때 또 뜬다.
//     창으로 뜨는 공지 = 가장 최근 공지 1개, 그것도 올린 지 한 달 안의 것만(새 폰에서 옛 공지가 줄줄이 뜨지 않게). 옛 공지는 공지 화면에서 본다.
const STORE_KEY = "home_popup_v1";
const readStore = () => { try { const j = JSON.parse(localStorage.getItem(STORE_KEY) || "{}"); return j && typeof j === "object" ? j : {}; } catch (e) { return {}; } };
const writeStore = (s) => { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch (e) {} };
// 오늘 하루 안 보기 — 지금 뜬 카드들의 키를 오늘 날짜와 함께 기억
export const hideHomePopupToday = (todayStr, keys) => { const s = readStore(); writeStore({ ...s, hideDate: todayStr, hideKeys: Array.isArray(keys) ? keys : [] }); };
// [163차수] 공지 카드 "앞으로 안 보기" — 그 공지 키를 폰에 기억(최근 100개). 예전의 "한 번 뜨면 끝"(seenNotices) 기록은 더 쓰지 않는다.
export const dismissNoticeForever = (noticeKey) => { if (!noticeKey) return; const s = readStore(); const off = Array.isArray(s.dismissedNotices) ? s.dismissedNotices : []; writeStore({ ...s, dismissedNotices: [...new Set([...off, String(noticeKey)])].slice(-100) }); };
// 오늘에서 한 달 전 날짜(YYYY-MM-DD)
const monthAgoStr = (todayStr) => { const d = new Date(String(todayStr).slice(0, 10) + "T00:00:00"); if (isNaN(d.getTime())) return ""; d.setMonth(d.getMonth() - 1); return fmtYMD(d); };
const truncate = (t, n) => { const s = String(t || "").replace(/\s+/g, " ").trim(); return s.length > n ? s.slice(0, n - 1) + "…" : s; };

export function computeHomePopup(D) {
  const { examDdays, pinnedMessages, popups, todayStr, unansweredSurveys, vocabWarn, wrongCount } = D;
  if (IS_STAFF_VIEW) return [];
  const store = readStore();
  const hidden = new Set(store.hideDate === todayStr && Array.isArray(store.hideKeys) ? store.hideKeys : []);
  const dismissedNotices = new Set(Array.isArray(store.dismissedNotices) ? store.dismissedNotices : []);
  const cards = [];
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
  // ⑤ 공지 — 가장 최근 1개만, 올린 지 한 달 안이고 "앞으로 안 보기"를 안 누른 것만
  const pm = Array.isArray(pinnedMessages) ? pinnedMessages : [];
  const latest = pm.find(([, rec]) => rec);
  if (latest) {
    const [dateKey, rec] = latest;
    const day = /^\d{4}-\d{2}-\d{2}/.test(String(dateKey)) ? String(dateKey).slice(0, 10) : "";
    const limit = monthAgoStr(todayStr);
    const recent = !day || !limit || day >= limit;
    if (recent && !dismissedNotices.has(String(dateKey))) {
      cards.push({ key: "notice-" + dateKey, noticeKey: String(dateKey), forever: true, tone: "navy", icon: "📣", title: "공지가 있어요", body: truncate(rec.text, 70), cta: "공지 보기", tab: "notices" });
    }
  }
  // ⑥ 원장이 올린 카드(워커 popups) — 기간 안의 것만
  (Array.isArray(popups) ? popups : []).forEach((p) => {
    if (!p || !p.id || !p.title) return;
    if (p.startDate && todayStr < String(p.startDate).slice(0, 10)) return;
    if (p.endDate && todayStr > String(p.endDate).slice(0, 10)) return;
    cards.push({ key: "custom-" + p.id, tone: "navy", icon: p.icon || "🎉", title: truncate(p.title, 40), body: truncate(p.body, 120), image: p.image || "", cta: p.button || "", tab: p.tab || "", url: p.url || "" });
  });
  return cards.filter((c) => !hidden.has(c.key)).slice(0, 5);
}
