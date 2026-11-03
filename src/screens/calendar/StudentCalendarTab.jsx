import { StudentMonthCalendar } from "./StudentMonthCalendar.jsx";

// ─── 일정 달력 탭 ───
// 등원 요일(시간표) · 학원 휴원일 · 내 학교 시험 · 지난 출석 · 보강을 월 달력 한 장에서 확인한다.
// [141차수] 달력 그리는 부분은 StudentMonthCalendar(홈 ⑤ 카드와 같은 부품)로 옮겼다. 여기서는 카드 모양(frame="card")으로 부르기만 한다.
export function StudentCalendarTab({ student, makeups, customHolidays, exams, attLog, attStatus }) {
  return <StudentMonthCalendar student={student} makeups={makeups} customHolidays={customHolidays} exams={exams} attLog={attLog} attStatus={attStatus} frame="card" />;
}
