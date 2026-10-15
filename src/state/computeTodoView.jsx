import { getTodayStr } from "../domain/time.jsx";
import { buildStepGroups, filterTodoDatesForReveal, pickDefaultTodoDate, stripLabels } from "../domain/todo.jsx";

// [121차수] 화면에 쓸 숙제 값 계산(공지·날짜 목록·오늘 숙제 단계·체크 판정·진행률) — App.jsx에서 그대로 옮김. 훅이 아니라 보통 함수(불러온 자료가 있을 때만 부른다).
export function computeTodoView(D) {
  const { checklistData, records, selectedDate, studentId, todos, vocaHwRec } = D;
  const sRec = records[studentId] || records[Number(studentId)] || {};
  const pinnedMessages = Object.entries(sRec)
    .filter(([, v]) => v && v.pinned)
    .sort(([a], [b]) => b.localeCompare(a));
  // allDates: homework/academy 또는 steps5 중 하나라도 데이터가 있는 날짜
  // [0813] 전체 목록(allDatesFull)을 먼저 만들고, 기본 날짜를 정한 뒤 단추 3개를 뽑는다.
  const allDatesRaw = Object.keys(todos)
    .filter((d) => {
      const t = todos[d]?.[studentId] || todos[d]?.[Number(studentId)];
      if (!t) return false;
      const hw = stripLabels(t.homework || "").trim();
      const ac = stripLabels(t.academy || "").trim();
      const hasSteps5 = t.steps5 && Object.values(t.steps5).some(v => (v || "").trim());
      return hw || ac || hasSteps5;
    })
    .sort((a, b) => b.localeCompare(a));
  // [0824 2차수] 밤 10시 숙제 공개(원장 확정 08-21) — 수업날에는 수업 중에 쓴 다음 투두가
  //   학생 폰에 바로 떠서 아이가 다음 숙제를 미리 보는 문제가 있었다. 학원이 밤 10시에 끝나므로
  //   오늘이 수업날이면 22시 전까지 앞으로 날짜를 숨긴다. 날짜 단추·기본 날짜·홈 카드가 전부 이 목록을 쓴다.
  const todayStrForTab = getTodayStr();
  const hourNow = new Date().getHours();
  const allDatesFull = filterTodoDatesForReveal(allDatesRaw, todayStrForTab, hourNow);
  // [0825 4차수] 지금 다음 숙제를 숨기고 있는 중인지 — 그냥 안 보이면 "숙제 없네?"로 오해해서 안내 한 줄을 띄운다
  const todoRevealHeld = Array.isArray(allDatesRaw) && allDatesRaw.length > allDatesFull.length;
  // [0813] 앱을 열었을 때 기본으로 보여줄 날짜 — 원장 결정:
  // ① 오늘 기록이 있으면 오늘 ② 없으면 오늘 이후 가장 가까운 기록(=다음 숙제)
  // ③ 미래 기록도 없으면 가장 최근 지난 기록. 학생이 단추로 고른 날짜(selectedDate)가 언제나 먼저다.
  // [96차수 09-05 · 원장 결정] 단, 수업날 밤 10시가 지나 다음 숙제가 열렸으면 그 다음 숙제가 기본(위 computeActiveTodoDateEarly와 같은 규칙).
  const defaultDate = pickDefaultTodoDate(allDatesFull, todayStrForTab, hourNow);
  // 날짜 단추는 3개 유지. 기본 날짜가 최신 3개 밖이면, 기본 날짜와 그보다 가까운 날짜 2개로 채운다.
  // [0813 검토수정] 예전에는 최신(=가장 먼) 2개를 데려와서 정작 가까운 날짜가 안 보였다.
  let allDates = allDatesFull.slice(0, 3);
  if (allDatesFull.includes(defaultDate) && !allDates.includes(defaultDate)) {
    const nearerNewer = allDatesFull.filter(d => d > defaultDate).slice(-2);
    allDates = [...nearerNewer, defaultDate];
  }
  const activeDate = selectedDate || defaultDate;
  const todo = todos[activeDate]?.[studentId] || todos[activeDate]?.[Number(studentId)] || {};
  // 5단계 그룹
  // 빈 단계도 "오늘 없음"으로 보여줘 학생이 전체 학습 흐름을 확인할 수 있게 한다.
  const stepGroups = buildStepGroups(todo);
  const chk = checklistData[activeDate]?.[studentId] || checklistData[activeDate]?.[Number(studentId)] || {};
  // 어드민과 동일한 3-상태 모델: undefined/false → none, true/"done" → done, "fail:사유..." → fail
  // 원장앱은 stableKey(step1_0, step3_1)를 우선 저장 키로 쓰므로 학생앱도 stableKey부터 조회한다.
  const TODO_CHECK_CLEAR_VALUE = "__todo_clear__";
  const getCheckValue = (itemOrType, idx) => {
    const candidates = [];
    if (itemOrType && typeof itemOrType === "object") {
      if (itemOrType.stableKey) candidates.push(itemOrType.stableKey);
      if (itemOrType.key) candidates.push(itemOrType.key);
      if (itemOrType.legacyKey) candidates.push(itemOrType.legacyKey);
      if (itemOrType.type && itemOrType.idx !== undefined) candidates.push(`${itemOrType.type}_${itemOrType.idx}`);
    } else if (itemOrType) {
      candidates.push(`${itemOrType}_${idx}`);
    }
    for (const key of [...new Set(candidates)]) {
      if (!Object.prototype.hasOwnProperty.call(chk, key)) continue;
      const value = chk[key];
      // 원장앱에서 명시적 미체크로 저장한 센티널이면 구버전 fallback을 더 보지 않는다.
      if (value === TODO_CHECK_CLEAR_VALUE) return undefined;
      if (value !== false && value !== null && value !== undefined && value !== "") return value;
    }
    return undefined;
  };
  const getCheckStatus = (itemOrType, idx) => {
    const val = getCheckValue(itemOrType, idx);
    if (!val) return "none";
    if (val === true || val === "done") return "done";
    if (typeof val === "string" && val.startsWith("fail:")) return "fail";
    return "done";
  };
  const getFailReason = (itemOrType, idx) => {
    const val = getCheckValue(itemOrType, idx);
    if (typeof val === "string" && val.startsWith("fail:")) return val.slice(5);
    return "";
  };
  const isChecked = (itemOrType, idx) => getCheckStatus(itemOrType, idx) === "done";
  const isFailed = (itemOrType, idx) => getCheckStatus(itemOrType, idx) === "fail";
  // [0825 5차수] "앱 단어" 줄 자동 완료 표시 — 원장앱 0819 자동체크와 같은 규칙.
  // 조건: ①숙제검사 칸의 "앱 단어" 줄 · 이 날짜 도장 있음 · 선생님이 손댄 값 없음(있으면 그 값이 이긴다).
  const isAutoVocaDone = (itemOrType) => {
    if (!vocaHwRec || !itemOrType || typeof itemOrType !== "object") return false;
    if (itemOrType.type !== "hw") return false;
    if (!/앱\s*단어/.test(String(itemOrType.text || ""))) return false;
    // 선생님이 일부러 끈 흔적(__todo_clear__)이 있으면 자동도 물러난다 — 원장앱과 같은 규칙
    const keys = [itemOrType.stableKey, itemOrType.key, itemOrType.legacyKey,
      (itemOrType.type !== undefined && itemOrType.idx !== undefined) ? `${itemOrType.type}_${itemOrType.idx}` : null].filter(Boolean);
    if (keys.some(k => chk[k] === TODO_CHECK_CLEAR_VALUE)) return false;
    return getCheckValue(itemOrType) === undefined;
  };
  const isCheckedView = (itemOrType, idx) => isChecked(itemOrType, idx) || isAutoVocaDone(itemOrType);
  // 진행률: 모든 step의 모든 item 합산
  const allItems = stepGroups.flatMap(s => s.items);
  // 미완료(fail) 항목은 진행률 계산에서 완전히 제외 (분모/분자 둘 다 빠짐)
  const countableItems = allItems.filter(item => !isFailed(item));
  const totalTasks = countableItems.length;
  const doneTasks = countableItems.filter(item => isCheckedView(item)).length;   // [0825 5차수] 앱 단어 자동 완료 포함
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;
  return { activeDate, allDates, doneTasks, getFailReason, isCheckedView, isFailed, pct, pinnedMessages, stepGroups, todayStrForTab, todoRevealHeld, totalTasks };
}
