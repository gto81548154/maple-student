
// ─── Helpers ───
export const DK = { 0: "일", 1: "월", 2: "화", 3: "수", 4: "목", 5: "금", 6: "토" };
export const fmtDateKR = (ds) => { const d = new Date(ds + "T00:00:00"); return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DK[d.getDay()]}요일`; };
export const fmtDateShort = (ds) => { if(!ds) return ""; const d = new Date(ds + "T00:00:00"); if(isNaN(d.getTime())) return ""; return `${d.getMonth() + 1}/${d.getDate()}(${DK[d.getDay()]})`; };
export const isToday = (ds) => { const t = new Date(); return ds === `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
export const getTodayStr = () => { const t = new Date(); return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`; };
// ─── 등원일 계산용 (admin 앱과 동일한 데이터 구조) ───
export const DAYS_EN = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
// 학생의 임시 시간표(tempSchedules)·방학 시간표(vacationSchedule) 처리 - admin과 동일
// ⚠️ 원장앱 getEffectiveSchedule과 동시 수정 규칙: 방학 분기는 두 파일에 동일하게 유지할 것
// ─── [144차수] 회차 수업 학생 — 요일이 아니라 "날짜를 찍어서" 오는 학생(원장앱 240차수 저장 모양 그대로) ───
//   학생 기록: lessonMode:"dates" · lessonDates:{"2026-11-03":{} | {time,staff}} · lessonTime:"7:00"(기본 시간)
//   이 학생은 요일 시간표(schedule)가 비어 있어서 전에는 홈 "다음 수업"·달력에 아무것도 안 떴다.
//   이제 찍은 날짜 = 등원일, 시간 = 그 날 따로 적힌 시간 → 없으면 기본 시간. 방학·임시 시간표는 보지 않는다(원장앱과 같은 규칙).
export const isDateLessonStudent = (s) => !!s && typeof s === "object" && s.lessonMode === "dates";
export const getLessonDateRow = (s, ds) => {
  const r = (s && s.lessonDates && typeof s.lessonDates === "object") ? s.lessonDates[String(ds || "").slice(0, 10)] : null;
  if (!r) return null;
  const o = (typeof r === "object") ? r : {};
  return { time: String(o.time || s.lessonTime || "7:00") };
};
export const getStudentVacation = (student, dateStr) => {
  if (isDateLessonStudent(student)) return null;   // [144차수] 회차 학생은 찍은 날짜가 전부
  const vs = student && student.vacationSchedule;
  if (vs && vs.startDate && vs.endDate && dateStr >= vs.startDate && dateStr <= vs.endDate
      && vs.schedule && Object.keys(vs.schedule).length > 0) return vs;
  return null;
};
export const getEffectiveSchedule = (student, dateStr) => {
  if (!student || typeof student !== "object") return { schedule: {} };
  // [144차수] 회차 학생: 찍은 날짜면 그 요일 한 칸만, 아니면 빈 시간표(원장앱 getEffectiveSchedule과 같은 모양)
  if (isDateLessonStudent(student)) {
    const row = getLessonDateRow(student, dateStr);
    if (!row) return { schedule: {}, isDates: true };
    return { schedule: { [ymdToDayEn(dateStr)]: row.time }, isDates: true };
  }
  // [방학] 방학 스케줄은 정규를 '통째로 교체'한다(요일이 바뀌는 학생 때문에 merge 금지). 우선순위: 방학 > 특별기간 > 정규
  const vac = getStudentVacation(student, dateStr);
  if (vac) return { schedule: { ...(vac.schedule || {}) }, isVacation: true };
  const ts = (student.tempSchedules || []).find(t => t.startDate && t.endDate && dateStr >= t.startDate && dateStr <= t.endDate);
  if (ts) return { schedule: { ...(student.schedule || {}), ...(ts.schedule || {}) } };
  return { schedule: student.schedule || {} };
};
// 시간 표기: "5:00" → "5시", "5:30" → "5시 30분"
export const fmtTime = (t) => {
  if (!t) return "";
  const [h, m] = String(t).split(":");
  const hour = parseInt(h, 10);
  const min = parseInt(m, 10) || 0;
  if (isNaN(hour)) return "";
  if (min === 0) return `${hour}시`;
  return `${hour}시 ${min}분`;
};
// YYYY-MM-DD
export const fmtYMD = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// ─── [교사 열람 모드] 그날 수업하는 학생 뽑기 (원장앱 To-Do와 같은 규칙) ───
// ① 그 요일 시간표에 자리가 있고 ② 등록일 이후이고 ③ 그날 숨김 처리(isHidden)가 안 된 학생
// + 보강·시간변경으로 그날만 오는 학생. 원장앱 getStudentsForDate를 그대로 옮긴 것이라
// 원장님 화면과 인원이 어긋나지 않는다. (순수 계산 — 시험도 이 함수를 그대로 돌린다)
export const ymdToDayEn = (ymd) => {
  const d = new Date(String(ymd || "").slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return "";
  return DAYS_EN[(d.getDay() + 6) % 7];
};
export const shiftYmd = (ymd, n) => {
  const d = new Date(String(ymd || "").slice(0, 10) + "T00:00:00");
  if (Number.isNaN(d.getTime())) return ymd;
  d.setDate(d.getDate() + n);
  return fmtYMD(d);
};
export const isEnrolledOnDate = (student, ymd) => {
  const sd = String((student && student.startDate) || "").slice(0, 10);
  const ds = String(ymd || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sd) || !/^\d{4}-\d{2}-\d{2}$/.test(ds)) return true;
  return ds >= sd;
};
