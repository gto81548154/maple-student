import { formatDdayLabel, getEngExamDateForDday, getExamStartEndForDday, getExamTargetDateForDday, isExamVisibleForStudentDday } from "./dday.jsx";
import { getEffectiveSchedule, isEnrolledOnDate, ymdToDayEn } from "./time.jsx";

export const computeTeacherDayRoster = (students = [], makeups = [], ymd = "") => {
  const dk = ymdToDayEn(ymd);
  if (!dk) return [];
  const ds = String(ymd).slice(0, 10);
  const rows = (Array.isArray(makeups) ? makeups : []).filter(m => m && String(m.date || "").slice(0, 10) === ds);
  const hidden = new Set(rows.filter(m => m.isHidden).map(m => String(m.studentId)));
  const byId = new Map((Array.isArray(students) ? students : []).map(s => [String(s.id), s]));

  // [135차수 g] 정지(paused)·삭제(deletedAt)된 학생은 명단에서 뺀다(원장앱과 같은 기준)
  const alive = (s) => !!s && !s.paused && !s.deletedAt;
  const reg = (Array.isArray(students) ? students : [])
    .filter(s => s && s.id != null && !String(s.name || "").includes("결원") && alive(s))
    .filter(s => {
      const eff = getEffectiveSchedule(s, ds);
      return !!(eff.schedule || {})[dk] && !hidden.has(String(s.id)) && isEnrolledOnDate(s, ds);
    })
    .map(s => ({ student: s, time: (getEffectiveSchedule(s, ds).schedule || {})[dk] || "", kind: "정규" }));

  // 같은 학생이 그날 여러 줄이어도 카드는 하나 — 마지막 줄을 채택(원장앱과 같은 처리)
  const mkById = new Map();
  rows.filter(m => !m.isHidden).forEach(m => { if (byId.has(String(m.studentId))) mkById.set(String(m.studentId), m); });
  const regIds = new Set(reg.map(r => String(r.student.id)));
  const mk = [...mkById.entries()]
    .filter(([sid]) => !regIds.has(sid))
    .map(([sid, m]) => ({ student: byId.get(sid), time: m.time || "", kind: m.mkType === "change" ? "시간변경" : "보강" }))
    .filter(r => r.student && !String(r.student.name || "").includes("결원") && alive(r.student));

  const timeVal = (t) => {
    const m = String(t || "").match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return 9999;
    const h = Number(m[1]);
    // 학원 시간표는 1:00~9:30 전부 오후다 — 1:00을 13시, 9:30을 21시 30분으로 읽는다.
    return (h < 12 ? h + 12 : h) * 60 + Number(m[2]);
  };
  return [...reg, ...mk].sort((a, b) => (timeVal(a.time) - timeVal(b.time)) || String(a.student.name || "").localeCompare(String(b.student.name || ""), "ko"));
};
// ─── [교사 열람 모드 10차수] 선생님 근무 달력 재료 ───
// 그날이 근무일인지(요일 근무 + 추가 근무 날짜), 몇 시 출근인지, 학생이 몇 명인지.
// 순수 계산 — 시험도 이 함수를 그대로 돌린다.
export const TEACHER_DK_KO = ["일", "월", "화", "수", "목", "금", "토"];
// [근무표 수정 15차수] 원장이 폰에서 고를 수 있는 출근 시간 — 원장앱 ALL_TIMES와 같은 목록이어야 한다.
export const TEACHER_TIME_CHOICES = ["1:00","1:30","2:00","2:30","3:00","3:30","4:00","4:30","5:00","5:30","6:00","6:30","7:00","7:30","8:00","8:30","9:00","9:30"];
export const teacherWorkOn = (teacher, ymd) => {
  const ds = String(ymd || "").slice(0, 10);
  const d = new Date(ds + "T00:00:00");
  if (Number.isNaN(d.getTime())) return null;
  const extra = (Array.isArray(teacher && teacher.extraWorkDates) ? teacher.extraWorkDates : [])
    .find(x => x && String(x.date || "").slice(0, 10) === ds);
  if (extra) return { time: extra.time || "", kind: "추가" };
  const wd = (teacher && teacher.workDays) || {};
  const t = wd[TEACHER_DK_KO[d.getDay()]];
  if (t === undefined || t === null || t === false) return null;
  return { time: t || "", kind: "근무" };
};
// ─── [오늘 수업 요약 16차수 · 원장 확정 C안] ────────────────────────────────
// 선생님이 수업 들어가기 전에 한 번 훑는 화면의 재료를 만든다.
//   위:  오늘 챙길 것  — 오늘 메모 → 📌 고정 메모 → 시험 D-day → 보강·시간변경
//        (오늘 위 · 고정 아래 순서는 원장앱 To-Do 특이사항 띠와 같은 규칙이다)
//   아래: 오는 순서    — 같은 시간끼리 묶는다. 사람 수(명)는 원장 지시대로 안 띄운다.
// 순수 계산 — 오늘 날짜를 밖에서 받는다(시험도 이 함수를 그대로 돌린다).

// 그 날짜 기준으로 학생의 가장 가까운 시험 하나. 끝난 시험은 안 센다.
// 영어일(engDates[학년])이 있으면 그 날 기준 — 영어학원이라 원장앱 D-day 칩과 같은 규칙.
const teacherExamDdayOn = (student, exams = [], ds = "") => {
  const day = String(ds || "").slice(0, 10);
  if (!student || !Array.isArray(exams) || !day) return null;
  const diffTo = (t) => {
    const a = new Date(String(t || "").slice(0, 10) + "T00:00:00");
    const b = new Date(day + "T00:00:00");
    if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
    return Math.round((a.getTime() - b.getTime()) / 86400000);
  };
  const items = exams
    .filter(e => e && !e.deletedAt && isExamVisibleForStudentDday(e, student))
    .map(e => {
      const { start, end } = getExamStartEndForDday(e);
      const target = getExamTargetDateForDday(e, student);
      const diff = diffTo(target);
      if (diff === null) return null;
      const endDs = String(end || start || "").slice(0, 10);
      if (endDs && endDs < day) return null;              // 이미 끝난 시험
      const startDs = String(start || "").slice(0, 10);
      const ongoing = !!(startDs && endDs && startDs <= day && day <= endDs);
      const engDs = String(getEngExamDateForDday(e, student) || "").slice(0, 10);
      const engDone = !!engDs && engDs < day;
      const school = String(e.school || "").trim();
      const kind = String(e.kind || "").trim();
      const type = String(e.type || "");
      const title = type === "모의고사"
        ? (e.name || "모의고사")
        : ([school, kind].filter(Boolean).join(" ") || e.name || "내신");
      return {
        id: String(e.id || `${title}_${target}`),
        title,
        type,
        diff,
        ongoing,
        label: engDone ? "영어 끝" : (ongoing && diff < 0 ? "시험 중" : formatDdayLabel(diff)),
        sortKey: engDone ? 9999 : (diff < 0 ? 0 : diff),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortKey - b.sortKey);
  return items[0] || null;
};
// 시험 줄에 띄울지 — 진행 중이거나 2주 안이면 "오늘 챙길 것"이다. 그보다 멀면 안 띄운다.
const TEACHER_BRIEF_EXAM_DAYS = 14;
const teacherBriefExamWorth = (x) => !!x && x.label !== "영어 끝" && (x.ongoing || (x.diff >= 0 && x.diff <= TEACHER_BRIEF_EXAM_DAYS));
// 시간 문자열을 정렬용 숫자로 (1:00~9:30 전부 오후 — computeTeacherDayRoster와 같은 규칙)
const teacherBriefTimeVal = (t) => {
  const m = String(t || "").match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return 9999;
  const h = Number(m[1]);
  return (h < 12 ? h + 12 : h) * 60 + Number(m[2]);
};
export const buildTeacherDayBrief = (roll = [], ds = "", exams = []) => {
  const day = String(ds || "").slice(0, 10);
  const rows = Array.isArray(roll) ? roll.filter(r => r && r.student) : [];
  const who = (r) => ({ id: String(r.student.id ?? ""), name: String(r.student.name || "") });
  const alerts = [];

  // ① 그날만 뜨는 메모 (원장앱: 흰 바탕 + 보라 테두리, 위쪽)
  rows.forEach(r => {
    const t = String(((r.student.todoNotes || {})[day]) || "").trim();
    if (t) alerts.push({ kind: "today", icon: "🔔", text: t, names: [who(r)], tone: "today" });
  });
  // ② 📌 고정 메모 (원장앱: 보라 꽉 참, 아래쪽 — 늘 그대로인 배경 정보라 뒤로 내린다)
  rows.forEach(r => {
    const t = String(r.student.todoPin || "").trim();
    if (t) alerts.push({ kind: "pin", icon: "📌", text: t, names: [who(r)], tone: "pin" });
  });
  // ③ 시험 D-day — 같은 시험은 한 줄로 묶고 이름을 옆에 단다
  const examMap = new Map();
  rows.forEach(r => {
    const x = teacherExamDdayOn(r.student, exams, day);
    if (!teacherBriefExamWorth(x)) return;
    const key = `${x.title} ${x.label}`;
    if (!examMap.has(key)) examMap.set(key, { kind: "exam", icon: "📅", text: key, names: [], sortKey: x.sortKey, tone: (x.ongoing || x.diff <= 7) ? "hot" : "warm" });
    examMap.get(key).names.push(who(r));
  });
  [...examMap.values()].sort((a, b) => a.sortKey - b.sortKey).forEach(v => { const { sortKey, ...rest } = v; alerts.push(rest); });
  // ④ 보강·시간변경 — 그날만 오는 학생
  ["보강", "시간변경"].forEach(kindName => {
    const hit = rows.filter(r => r.kind === kindName);
    if (hit.length) alerts.push({ kind: "makeup", icon: kindName === "보강" ? "🔁" : "🔄", text: kindName, names: hit.map(who), tone: "info" });
  });

  // 오는 순서 — 같은 시간끼리 묶는다
  const slotMap = new Map();
  rows.forEach(r => {
    const t = String(r.time || "");
    if (!slotMap.has(t)) slotMap.set(t, []);
    slotMap.get(t).push({ ...who(r), kind: r.kind || "정규" });
  });
  const slots = [...slotMap.entries()]
    .sort((a, b) => teacherBriefTimeVal(a[0]) - teacherBriefTimeVal(b[0]))
    .map(([time, list]) => ({ time: time || "시간 미정", rows: list }));

  return { alerts, slots };
};
