import { HOLIDAYS } from "../data/holidays.jsx";
import { DAYS_EN, DK, fmtYMD, getEffectiveSchedule } from "./time.jsx";

// ─── [0813] 홈 등원 안내: 오늘 등원 + 다음 수업 ───
// 하루치 등원 판정. 규칙은 아래와 같다(118차수에서 지운 옛 "다가올 등원일 계산"과 같은 규칙)
// (공휴일 제외 → 등원 취소(isHidden) 제외 → 보충·시간변경 우선 → 방학>특별기간>정규 시간표).
/* [0819 늦음판정 보정] 학원 시간표 시각("4:00", "8:30")은 오전/오후 표기가 없는 오후 시각이다.
 * 예전에는 이걸 그대로 시(時)로 써서 "4:00"이 새벽 4시가 됐고, 오후 등원 학생의 앱 숙제가
 * 전부 "늦은 완료"로 찍힐 뻔했다. 규칙: 1~11시는 오후로(+12), 12시·이미 24시간 표기는 그대로.
 * 혹시 아침 등원(방학 특강)이 섞여도 마감이 늦은 쪽으로 잡힐 뿐, 학생에게 불리해지지 않는다. */
export const academyHour24 = (hh) => {
  const h = parseInt(hh, 10);
  if (!Number.isFinite(h)) return 0;
  return (h >= 1 && h <= 11) ? h + 12 : h;
};
export const attEntryForDay = (student, mks, allHol, d, attStatus = {}) => {
  const ds = fmtYMD(d);
  const record = attStatus?.[ds]?.[student.id];   // [124차수] 출결 기록(결석·등원·지각). 기록이 없으면 예전과 같다
  if(record?.type==="absent")return null;
  if (allHol[ds] && record?.type!=="present" && record?.type!=="late") return null; // 휴원일 등원 취소 예외 존중
  const dayKey = DAYS_EN[d.getDay() === 0 ? 6 : d.getDay() - 1];
  const visibleMk = mks.find(m => m.date === ds && !m.isHidden); // 보충 또는 시간변경
  if (visibleMk) {
    return { date: ds, dateObj: new Date(d), time: visibleMk.time, isMakeup: visibleMk.isOverride !== true, isVacation: false };
  }
  if (mks.some(m => m.date === ds && m.isHidden)) return null; // 등원 취소된 날
  const eff = getEffectiveSchedule(student, ds);
  const t = eff.schedule[dayKey];
  if (!t) return null;
  return { date: ds, dateObj: new Date(d), time: t, isMakeup: false, isVacation: !!eff.isVacation };
};
// 오늘이 등원일이면 today에, 오늘 이후 가장 가까운 등원일(4주 안)이 next에 담긴다.
export const computeAttNotice = (student, makeups, customHolidays, attStatus = {}) => {
  if (!student) return { today: null, next: null };
  const allHol = { ...HOLIDAYS, ...(customHolidays || {}) };
  const mks = (makeups || []).filter(m => String(m.studentId) === String(student.id));
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const todayEntry = attEntryForDay(student, mks, allHol, base, attStatus);
  let nextEntry = null;
  for (let i = 1; i <= 28 && !nextEntry; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    nextEntry = attEntryForDay(student, mks, allHol, d, attStatus);
  }
  return { today: todayEntry, next: nextEntry };
};
// [109차수 09-08] 홈 위 칸의 "이번 주 7일" 줄 재료 — 오늘이 항상 맨 왼쪽, 하루 지나면 저절로 한 칸씩 넘어간다(원장 결정).
//   판정은 computeAttNotice와 같은 attEntryForDay 하나를 쓴다(공휴일·등원 취소·보충·방학 규칙이 어긋나지 않게).
//   entry가 있으면 그날 등원(연한 파란 칸), 없으면 빈 날(하얀 칸). 시간을 만들어 내지 않는다.
export const computeAttWeek = (student, makeups, customHolidays, days = 7, attStatus = {}) => {
  if (!student) return [];
  const allHol = { ...HOLIDAYS, ...(customHolidays || {}) };
  const mks = (makeups || []).filter(m => String(m.studentId) === String(student.id));
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    out.push({ date: fmtYMD(d), dateObj: d, entry: attEntryForDay(student, mks, allHol, d, attStatus), attMark: attStatus?.[fmtYMD(d)]?.[student.id] || null, isToday: i === 0 });
  }
  return out;
};
// 날짜 → "8월 19일 (수)"
export const fmtAttDayParen = (d) => `${d.getMonth() + 1}월 ${d.getDate()}일 (${DK[d.getDay()]})`;
// 등원 항목 꼬리표 — 보충이면 " (보충)"만 붙인다.
// [0813] "(방학)" 꼬리표 삭제 — 원장 결정.
//   원래 뜻은 "이 시간은 방학 시간표에서 가져온 시간"이었지만,
//   학생이 "그날은 쉬는 날"로 오해해서 홈 등원 안내(파란 띠·흰 띠) 두 곳 모두에서 안 붙이기로 함.
//   시간 자체는 방학 시간표 값이 그대로 나오므로 정보 손실 없음.
//   되살리려면 : 뒤에 (a && a.isVacation ? " (방학)" : "") 분기를 다시 넣으면 된다.
export const attTag = (a) => (a && a.isMakeup ? " (보충)" : "");
