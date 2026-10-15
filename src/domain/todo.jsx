import { getTodayStr } from "./time.jsx";

// ─── 5단계 정의 (학생용 라벨/색상/배지) ───
const STEP_DEFS = [
  { key: 'step1', label: '숙제',        color: '#e84393', bg: '#fdf2f8', badges: ['조교', '강사'] },
  { key: 'step2', label: '단어 TEST',   color: '#7c3aed', bg: '#f3e8ff', badges: ['조교'] },
  { key: 'step3', label: '오늘 수업',   color: '#1C66A5', bg: '#eef1ff', badges: ['조교', '강사'], notice: '→ 수업 준비되면 조교T 한테 말씀드리기' },
  { key: 'step4', label: '마무리 TEST', color: '#00b894', bg: '#e8f8f5', badges: ['조교'] },
  { key: 'step5', label: '받을 자료',   color: '#e67e22', bg: '#fff4e6', badges: ['강사'] },
];

// ─── stripLabels (원장님 앱과 동일) ───
export const stripLabels = (v) => v.split('\n').filter(l => !/^\s*\[(숙제|학원|학원과제)\]\s*$/.test(l)).join('\n');
// ─── 줄 맨 앞의 'ㅁ' 글자 제거 (학생 표시용 — 왼쪽에 이미 체크박스 있어서 중복) ───
export const stripBox = (s) => s.replace(/^\s*ㅁ\s*/, '');
// ─── [112차수] ③오늘 수업 "1차 수업 / 2차 수업" 칸 — 원장앱 169~170차수와 같은 규칙 ───
//   원장앱에서 ③칸을 나누면 줄 맨 앞에 "1차-" "2차-" "3차-"가 붙어 저장된다(선생님들이 9/7부터 손으로 쓰던 모양).
//   학생 화면에서는 그 글자를 떼고 "1차 수업"·"2차 수업" 이름 줄로 묶어 보여 준다.
//   체크 열쇠(몇 번째 줄·옛 글 열쇠)는 그대로 두고, 보여 주는 글과 순서만 바꾼다.
const LESSON_SESSION_MAX = 3;
// [114차수] 줄 앞에 "□ " 같은 표시가 있어도 차수를 알아본다 — 원장앱 172차수와 같은 규칙
const LESSON_SESSION_PREFIX_RE = /^\s*(?:[□☐●·]\s*)?([1-3])\s*차\s*[-–—]\s*/;
// 줄 맨 앞 차수를 뗀다 — 겹쳐 붙었으면("1차-2차-…") 안쪽(나중) 차수가 이긴다
const collapseLessonSessionPrefix = (line = "") => {
  let s = String(line ?? "");
  let session = 0;
  for (let guard = 0; guard < 8; guard++) {
    const m = s.match(LESSON_SESSION_PREFIX_RE);
    if (!m) break;
    session = Number(m[1]);
    s = s.slice(m[0].length);
  }
  return { session, body: s };
};
export const stripLessonSessionPrefix = (line = "") => collapseLessonSessionPrefix(line).body;
// "2차-"처럼 차수만 있고 내용이 없는 줄 — 원장앱은 빈 줄로 친다(체크 자리를 맞추려고 여기서도 건너뛴다)
const isLessonSessionOnlyLine = (line = "") => {
  const { session, body } = collapseLessonSessionPrefix(line);
  return session > 0 && !String(body).trim();
};
// 칸 색 — 원장앱과 같은 초록·보라·회색
export const LESSON_SESSION_COLORS = {
  1: { main: "#00b894", text: "#00866a", soft: "#e8f8f5" },
  2: { main: "#7c3aed", text: "#6d28d9", soft: "#f3e8ff" },
  3: { main: "#64748b", text: "#475569", soft: "#f1f5f9" },
};
// 칸으로 묶기 — 차수가 하나도 없으면 null(예전 모양 그대로). 차수 없는 줄은 1차 칸. 원래 자리(idx)도 같이 준다.
export const groupTodoLessonSessionItems = (items = []) => {
  const list = Array.isArray(items) ? items : [];
  if (!list.some(it => it && Number(it.session) > 0)) return null;
  const byN = {};
  list.forEach((item, idx) => {
    if (!item) return;
    const n = Math.min(LESSON_SESSION_MAX, Math.max(1, Number(item.session) || 1));
    (byN[n] = byN[n] || []).push({ item, idx });
  });
  return Object.keys(byN).map(Number).sort((a, b) => a - b).map(n => ({ session: n, entries: byN[n] }));
};
// ─── todo → 단계별 그룹 ───
// 원장앱과 동일한 내용 기반 item.key를 만든다.
// 단, 예전 학생앱 체크값(hw_0/ac_0)도 fallback으로 읽을 수 있게 legacyKey를 같이 보관한다.
const TODO_SECTION_RE = /^\s*\[(숙제|학원|학원과제)\]\s*$/;
const TODO_LESSON_PREFIX_RE = /^수업\s*-\s*/i;
const EMPTY_STEPS5 = { step1: "", step2: "", step3: "", step4: "", step5: "" };
const cleanTodoText = (v = "") => String(v).replace(/^[\s□☐●·\-]*/, "").trim();
const makeItemKey = (type, text, seen) => {
  const slug = String(text || "").replace(/[^가-힣a-zA-Z0-9]/g, "").slice(0, 20) || "item";
  let key = `${type}_${slug}`;
  let n = 1;
  while (seen.has(key)) { n++; key = `${type}_${slug}${n}`; }
  seen.add(key);
  return key;
};
const parseTodoLine = (line) => {
  const normalized = cleanTodoText(line);
  if (!normalized) return null;
  const parts = normalized.split(/\s*(?:->|→)\s*/).map(cleanTodoText).filter(Boolean);
  if (parts.length === 0) return null;

  let homework = "", academy = "", lesson = "";
  const last = parts[parts.length - 1] || "";
  const hasLesson = TODO_LESSON_PREFIX_RE.test(last);

  if (parts.length === 1) {
    academy = parts[0];
  } else if (parts.length === 2 && hasLesson) {
    homework = parts[0];
    academy = parts[0];
    lesson = last.replace(TODO_LESSON_PREFIX_RE, "").trim();
  } else if (parts.length === 2 && !hasLesson) {
    homework = parts[0];
    academy = parts[1];
  } else if (parts.length >= 3 && hasLesson) {
    homework = parts[0];
    academy = parts.slice(1, -1).join(" / ");
    lesson = last.replace(TODO_LESSON_PREFIX_RE, "").trim();
  } else {
    homework = parts[0];
    academy = parts.slice(1).join(" / ");
  }

  return { raw: normalized, homework, academy, lesson };
};
const normalizeVocabTestLine = (line) => {
  const original = String(line ?? "");
  if (!original.trim()) return original;
  const prefixMatch = original.match(/^(\s*(?:[□☐●·\-]\s*)?)/);
  const prefix = prefixMatch ? prefixMatch[1] : "";
  const core = original.slice(prefix.length).trim();
  if (!core) return original;
  const m = core.match(/^(.+?)\s+((?:\d+\s*(?:[,，]|\s)\s*)*\d+)\s*(?:TEST|test|Test|테스트)?\s*$/i);
  if (!m) return original;
  const book = (m[1] || "").trim();
  const nums = (m[2] || "").match(/\d+/g) || [];
  if (!book || nums.length === 0) return original;
  return `${prefix}${book} ${nums.join(", ")} TEST`;
};
const normalizeVocabTestText = (text) => String(text || "").split("\n").map(normalizeVocabTestLine).join("\n");
const normalizeSteps5 = (steps5) => {
  const s = { ...EMPTY_STEPS5, ...(steps5 || {}) };
  return { ...s, step2: normalizeVocabTestText(s.step2) };
};
const splitTodoLines = (txt) => String(txt || "")
  .split("\n")
  .map(cleanTodoText)
  .filter(l => l && !TODO_SECTION_RE.test(l));
const buildTodoFlow = (homework = "", academy = "") => {
  const seen = new Set();
  const homeworkItems = [];
  const academyItems = [];

  splitTodoLines(homework).forEach(line => {
    const parsed = parseTodoLine(line);
    if (!parsed) return;
    if (parsed.homework) {
      homeworkItems.push({ key: makeItemKey("hw", parsed.homework, seen), text: parsed.homework });
      if (parsed.academy) academyItems.push({ key: makeItemKey("ac", parsed.academy, seen), text: parsed.academy, lesson: parsed.lesson || "" });
      else if (parsed.lesson) academyItems.push({ key: makeItemKey("ac", `수업${parsed.lesson}`, seen), text: `수업-${parsed.lesson}`, lesson: "", isDirectLesson: true });
    } else {
      homeworkItems.push({ key: makeItemKey("hw", line, seen), text: line });
    }
  });

  splitTodoLines(academy).forEach(line => {
    const cleaned = cleanTodoText(line);
    if (!cleaned) return;
    const arrowParts = cleaned.split(/\s*(?:->|→)\s*/);
    const last = arrowParts[arrowParts.length - 1] || "";
    const hasLesson = arrowParts.length >= 2 && TODO_LESSON_PREFIX_RE.test(last);
    if (hasLesson) {
      const lesson = last.replace(TODO_LESSON_PREFIX_RE, "").trim();
      const text = arrowParts.slice(0, -1).join(" / ").trim();
      academyItems.push({ key: makeItemKey("ac", text, seen), text, lesson });
    } else if (TODO_LESSON_PREFIX_RE.test(cleaned)) {
      const lesson = cleaned.replace(TODO_LESSON_PREFIX_RE, "").trim();
      academyItems.push({ key: makeItemKey("ac", `수업${lesson}`, seen), text: `수업-${lesson}`, lesson: "", isDirectLesson: true });
    } else {
      academyItems.push({ key: makeItemKey("ac", cleaned, seen), text: cleaned, lesson: "" });
    }
  });

  academyItems.sort((a, b) => { const ad = /배포/.test(a.text); const bd = /배포/.test(b.text); return ad === bd ? 0 : ad ? 1 : -1; });
  return { homeworkItems, academyItems };
};
const buildSteps5FromLegacy = (homework, academy) => {
  const flow = buildTodoFlow(homework || "", academy || "");
  const result = { ...EMPTY_STEPS5 };
  result.step1 = (flow.homeworkItems || []).map(it => it.text).join("\n");
  const buckets = { step2: [], step3: [], step4: [], step5: [] };
  (flow.academyItems || []).forEach(item => {
    const t = item.text || "";
    let key;
    if (/배포/.test(t)) key = "step5";
    else if (/빈칸|픽스노트/.test(t)) key = "step4";
    else if (/단어|어휘/.test(t)) key = "step2";
    else key = "step3";
    const line = item.lesson ? `${t} → 수업-${item.lesson}` : t;
    buckets[key].push(line);
  });
  result.step2 = buckets.step2.join("\n");
  result.step3 = buckets.step3.join("\n");
  result.step4 = buckets.step4.join("\n");
  result.step5 = buckets.step5.join("\n");
  return result;
};
// ─── [0825 5차수] 화면 기본 날짜(activeDate)를 훅 자리(이른 위치)에서 계산하는 도우미 ───
// 본문의 0813(기본 날짜)·0824(밤 10시 숨김) 계산과 반드시 같은 결과여야 한다 — 규칙을 바꾸면 두 곳을 같이 고칠 것.
// 앱 단어 숙제 도장을 읽을 날짜를 정하는 데 쓴다(도장은 "수업 날짜"에 찍힌다).
export const computeActiveTodoDateEarly = (todos, studentId, selectedDate) => {
  try {
    if (selectedDate) return selectedDate;
    const allDatesRaw = Object.keys(todos || {})
      .filter((d) => {
        const t2 = todos[d]?.[studentId] || todos[d]?.[Number(studentId)];
        if (!t2) return false;
        const hw = stripLabels(t2.homework || "").trim();
        const ac = stripLabels(t2.academy || "").trim();
        const hasSteps5 = t2.steps5 && Object.values(t2.steps5).some(v => (v || "").trim());
        return hw || ac || hasSteps5;
      })
      .sort((a, b) => b.localeCompare(a));
    const todayStr = getTodayStr();
    const hourNow = new Date().getHours();
    const allDatesFull = filterTodoDatesForReveal(allDatesRaw, todayStr, hourNow);
    return pickDefaultTodoDate(allDatesFull, todayStr, hourNow) || "";   // [96차수] 밤 10시 규칙도 본문과 같게
  } catch (e) { return ""; }
};
export const buildStepGroups = (todo) => {
  if (!todo) return [];
  const steps5 = normalizeSteps5(todo.steps5 || buildSteps5FromLegacy(todo.homework || "", todo.academy || ""));
  const seen = new Set();
  let hwIdx = 0;
  let acIdx = 0;

  return STEP_DEFS.map(def => {
    const type = def.key === "step1" ? "hw" : "ac";
    // 원장앱 체크 저장 키와 맞추기 위해 각 step 안에서 0부터 다시 센다.
    // 예: step1_0, step3_1
    let stableIndex = 0;
    const items = String(steps5[def.key] || "")
      .split("\n")
      .map(line => {
        const raw = cleanTodoText(line);
        if (!raw) return null;
        if (isLessonSessionOnlyLine(raw)) return null;   // [112차수] 원장앱과 같게 — "2차-"만 있는 줄은 빈 줄
        const parsed = parseTodoLine(raw) || { raw };
        let keyText;
        let lesson = parsed.lesson || "";
        if (lesson) {
          keyText = type === "hw"
            ? (parsed.homework || parsed.academy || parsed.raw || raw)
            : (parsed.academy || parsed.homework || parsed.raw || raw);
        } else {
          keyText = parsed.raw || raw;
        }
        keyText = cleanTodoText(keyText);
        if (!keyText) return null;
        const idx = type === "hw" ? hwIdx++ : acIdx++;
        const stableKey = `${def.key}_${stableIndex}`;
        stableIndex += 1;
        const itemKey = makeItemKey(type, keyText, seen);
        const legacyKey = `${type}_${idx}`;
        // [112차수] ③칸 차수 — 원장앱처럼 줄 원문에서 읽는다. 보이는 글에서는 떼고(칸 이름이 알려 준다), 열쇠(itemKey)는 예전 글 그대로.
        const session = def.key === "step3" ? collapseLessonSessionPrefix(line).session : 0;
        const showText = session ? (cleanTodoText(stripLessonSessionPrefix(keyText)) || keyText) : keyText;
        return {
          key: itemKey,
          legacyKey,
          stableKey,
          text: lesson ? `${stripBox(showText)} → 수업-${lesson}` : stripBox(showText),
          type,
          idx,
          lesson,
          session,
          _sourceStep: def.key,
        };
      })
      .filter(Boolean);
    return { ...def, items };
  });
};
// ─── [0813] 숙제 기본 날짜 고르기 — 원장 결정 규칙 ───
// ① 오늘 기록이 있으면 오늘 ② 없으면 오늘 이후 가장 가까운 기록 날짜(다음 숙제)
// ③ 미래 기록도 없으면 가장 최근 지난 기록 ④ 기록이 하나도 없으면 오늘
export function pickDefaultTodoDate(allDatesFull, todayStr, hour) {
  const list = Array.isArray(allDatesFull) ? allDatesFull : [];
  const upcoming = list.filter(d => d > todayStr).sort()[0];
  // [96차수 09-05 · 원장 결정] 수업날 밤 10시가 지나 다음 숙제가 열렸으면 그 다음 숙제를 기본으로 보여준다.
  //   예전엔 이 시간대에도 오늘(이미 끝난) 숙제가 먼저 보여서 학생이 숙제 탭 → 날짜 단추를 눌러야 다음 숙제가 보였다.
  //   hour를 안 넘기면(옛 호출) 예전 규칙 그대로.
  if (list.includes(todayStr) && Number(hour) >= 22 && upcoming) return upcoming;
  if (list.includes(todayStr)) return todayStr;
  if (upcoming) return upcoming;
  return list[0] || todayStr;
}
// ─── [0824 2차수] 밤 10시 숙제 공개 — 원장 확정(08-21) ───
// 오늘이 수업날(오늘 투두가 있는 날)이면 밤 10시(22시) 전까지 앞으로 날짜의 투두를 숨긴다.
// 수업 없는 날은 하루 종일 보인다 — 집에서 숙제하러 들어온 학생은 다음 수업 숙제를 봐야 하므로.
// 밤 10시가 지나면(또는 다음 날부터) 예전과 똑같이 전부 보인다.
export function filterTodoDatesForReveal(allDates, todayStr, hour) {
  const list = Array.isArray(allDates) ? allDates : [];
  if (!list.includes(todayStr)) return list;   // 오늘 수업이 없으면 예전 그대로
  if (Number(hour) >= 22) return list;         // 밤 10시부터는 전부 공개
  return list.filter(d => d <= todayStr);      // 수업날 10시 전 = 오늘까지만
}
