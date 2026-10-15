import { useState } from "react";
import { HOLIDAYS } from "../../data/holidays.jsx";
import { getExamStartEndForDday, isExamVisibleForStudentDday } from "../../domain/dday.jsx";
import { DAYS_EN, fmtYMD, getEffectiveSchedule, getStudentVacation } from "../../domain/time.jsx";
import { TAP } from "../../theme/tokens.jsx";

// ─── 일정 달력 탭 ───
// 등원 요일(시간표) · 학원 휴원일 · 내 학교 시험 · 지난 출석 · 보강을 월 달력 한 장에서 확인한다.
export function StudentCalendarTab({ student, makeups, customHolidays, exams, attLog, attStatus }) {
  const todayObj = new Date(); todayObj.setHours(0, 0, 0, 0);
  const todayStr = fmtYMD(todayObj);
  const [ym, setYm] = useState({ y: todayObj.getFullYear(), m: todayObj.getMonth() });
  const [selDate, setSelDate] = useState(todayStr);

  const sid = String(student?.id || "");
  const allHol = { ...HOLIDAYS, ...(customHolidays || {}) };
  const holName = (v) => (typeof v === "string" ? v : (v && v.name) || "휴원");
  const mks = (makeups || []).filter((m) => m && String(m.studentId) === sid);
  const myExams = (exams || []).filter((ex) => ex && !ex.deletedAt && isExamVisibleForStudentDday(ex, student));

  const attOf = (ds) => { const day = attLog && attLog[ds]; if (!day || typeof day !== "object") return null; return day[sid] ?? Object.values(day)[0] ?? null; };
  // [출결] 결석/지각 (att3): 원장앱에서 기록한 출결 상태 — 본인 것만 번들로 수신
  const attStatusOf = (ds) => { const day = attStatus && attStatus[ds]; if (!day || typeof day !== "object") return null; return day[sid] ?? null; };
  const examsOf = (ds) => myExams.filter((ex) => {
    const { start, end } = getExamStartEndForDday(ex);
    const s = String(start || "").slice(0, 10);
    const e = String(end || start || "").slice(0, 10) || s;
    return s && s <= ds && ds <= e;
  });
  const dayInfo = (ds, dObj) => {
    const hol = allHol[ds];
    const hiddenMk = mks.some((m) => m.date === ds && m.isHidden);
    const visMk = mks.find((m) => m.date === ds && !m.isHidden);
    const attMark=attStatusOf(ds);
    let attendTime = null;
    if ((!hol || attMark?.type==="present" || attMark?.type==="late") && !hiddenMk && attMark?.type!=="absent") {
      if (visMk) attendTime = visMk.time || "";
      else {
        const dayKey = DAYS_EN[dObj.getDay() === 0 ? 6 : dObj.getDay() - 1];
        const eff = getEffectiveSchedule(student, ds);
        attendTime = (eff && eff.schedule && eff.schedule[dayKey]) || null;
      }
    }
    return { hol, hiddenMk, visMk, attendTime, isVac: !!getStudentVacation(student, ds), att: attOf(ds), attMark, dayExams: examsOf(ds) };
  };

  const first = new Date(ym.y, ym.m, 1);
  const firstDow = first.getDay(); // 0=일요일 시작
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  // [85차수 08-31 · 원장 요청] 앞뒤 빈칸을 전달·다음달 날짜(연회색)로 채운다 — 누르면 달력이 그 달로 넘어간다
  const cells = [];
  for (let i = firstDow; i > 0; i--) cells.push(new Date(ym.y, ym.m, 1 - i));
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(ym.y, ym.m, d));
  for (let d = 1; cells.length % 7 !== 0; d++) cells.push(new Date(ym.y, ym.m + 1, d));
  const move = (diff) => setYm((p) => { const d = new Date(p.y, p.m + diff, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const sel = selDate ? dayInfo(selDate, new Date(selDate + "T00:00:00")) : null;
  const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
  const navBtn = { width: TAP, height: TAP, borderRadius: 11, border: "1px solid #e5e0d8", background: "#faf9f7", cursor: "pointer", fontSize: 13, fontWeight: 800, color: "#555" };

  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: "14px 12px", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
          <button onClick={() => move(-1)} style={navBtn}>◀</button>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#2A2A28" }}>{ym.y}년 {ym.m + 1}월</div>
          <button onClick={() => move(1)} style={navBtn}>▶</button>
        </div>
        {student?.vacationSchedule?.startDate && student?.vacationSchedule?.endDate && (
          <div style={{ textAlign: "center", marginBottom: 8 }}>
            <span style={{ display: "inline-block", fontSize: 11.5, fontWeight: 800, color: "#B45309", background: "#FFF6E0", border: "1px solid #F2C14E", borderRadius: 999, padding: "3px 12px" }}>
              🏖 {student.vacationSchedule.name || "방학"} 시간표 · {String(student.vacationSchedule.startDate).slice(5).replace("-", "/")} ~ {String(student.vacationSchedule.endDate).slice(5).replace("-", "/")}
            </span>
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 }}>
          {WEEK_KO.map((w, i) => (
            <div key={w} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, color: i === 0 ? "#D2402E" : i === 6 ? "#2A6FDB" : "#999", padding: "4px 0" }}>{w}</div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
          {cells.map((dObj, idx) => {
            if (!dObj) return <div key={"e" + idx} />;
            const out = dObj.getMonth() !== ym.m;   // [85차수] 전달·다음달 날짜 — 연하게, 누르면 그 달로
            const ds = fmtYMD(dObj);
            const info = dayInfo(ds, dObj);
            const isSel = ds === selDate;
            const isToday = ds === todayStr;
            const attended = !!(info.att && (info.att.inAt || info.att.inTime));
            return (
              <button key={ds} data-student-calendar-date={ds} onClick={() => { if (out) setYm({ y: dObj.getFullYear(), m: dObj.getMonth() }); setSelDate(ds); }} style={{
                minHeight: 52, padding: "5px 2px 4px", borderRadius: 9, cursor: "pointer",
                opacity: out ? 0.5 : 1,
                border: isSel ? "1.8px solid #2A6FDB" : isToday ? "1.5px solid #b9cff2" : (info.attendTime != null && info.isVac) ? "1.5px solid #F2C14E" : "1px solid transparent",
                background: (info.hol || info.attMark?.type==="absent") ? "#FDF0EE" : info.attendTime != null ? "#F0F6FF" : info.isVac ? "#FFF6E0" : "#fff",
                display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
              }}>
                <span style={{ fontSize: 12.5, fontWeight: isToday ? 800 : 600, color: out ? "#b6bac4" : info.hol ? "#D2402E" : dObj.getDay() === 0 ? "#D2402E" : dObj.getDay() === 6 ? "#2A6FDB" : "#333" }}>{dObj.getDate()}</span>
                <span style={{ display: "flex", gap: 2, alignItems: "center", minHeight: 11 }}>
                  {info.dayExams.length > 0 && <span style={{ width: 6, height: 6, borderRadius: 3, background: "#E67E22" }} />}
                  {info.visMk && <span style={{ width: 6, height: 6, borderRadius: 3, background: "#8E44AD" }} />}
                  {attended && <span style={{ fontSize: 11, fontWeight: 800, color: "#1B8A5A", lineHeight: 1 }}>✓</span>}
                  {info.attMark?.type === "late" && <span style={{ fontSize: 11, fontWeight: 900, color: "#E8890C", lineHeight: 1 }}>△</span>}
                  {info.attMark?.type === "absent" && <span style={{ fontSize: 11, fontWeight: 900, color: "#D2402E", lineHeight: 1.2, whiteSpace: "nowrap" }}>결석</span>}   {/* [135차수 q] "× 결석" → "결석"(칸이 좁아 두 줄로 꺾이던 것). 칸은 이미 빨강 */}
                </span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, padding: "8px 4px 0", borderTop: "1px solid #f2efe9" }}>
          {[["#F0F6FF", "등원일", 1], ["#FFF6E0", "방학기간", 1], ["#FDF0EE", "휴원", 1], ["#E67E22", "시험", 0], ["#8E44AD", "보강·시간변경", 0], ["#1B8A5A", "출석 ✓", 0]].map(([c, label, isBg]) => (
            <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#777", fontWeight: 600 }}>
              <span style={{ width: 10, height: 10, borderRadius: isBg ? 3 : 5, background: c, border: isBg ? "1px solid #e0dcd4" : "none", display: "inline-block" }} />{label}
            </span>
          ))}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#777", fontWeight: 600 }}>
            <span style={{ fontSize: 11, fontWeight: 900, color: "#E8890C", lineHeight: 1 }}>△</span>지각
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#777", fontWeight: 600 }}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: "#FDF0EE", border: "1px solid #e8b4ae", display: "inline-block" }} />결석
          </span>
        </div>
      </div>

      {sel && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: "14px 16px", marginTop: 12, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, color: "#2A2A28", marginBottom: 8 }}>
            {Number(selDate.slice(5, 7))}월 {Number(selDate.slice(8, 10))}일 ({WEEK_KO[new Date(selDate + "T00:00:00").getDay()]})
          </div>
          {(() => {
            const rows = [];
            if (sel.hol) rows.push(["휴원", holName(sel.hol), "#D2402E"]);
            sel.dayExams.forEach((ex) => {
              const { start, end } = getExamStartEndForDday(ex);
              const period = start && end && start !== end ? `${String(start).slice(5, 10)} ~ ${String(end).slice(5, 10)}` : "";
              rows.push(["시험", `${ex.name || ex.type || "시험"}${period ? ` (${period})` : ""}`, "#E67E22"]);
            });
            if (sel.visMk && sel.attMark?.type!=="absent") rows.push([sel.visMk.isOverride ? "시간변경" : "보강", sel.visMk.time ? `${sel.visMk.time} 등원` : "시간 미정", "#8E44AD"]);
            else if (sel.attendTime && sel.attMark?.type!=="absent") rows.push([sel.isVac ? "방학 시간표" : "등원", `${sel.attendTime} 등원${selDate < todayStr ? "" : " 예정"}`, sel.isVac ? "#B45309" : "#2A6FDB"]);   // [96차수] 지난 날은 "예정"을 뺀다
            if (sel.hiddenMk) rows.push(["등원 취소", "이 날은 등원이 취소되었어요", "#999999"]);
            if (sel.attMark?.type === "late") rows.push(["지각", Number(sel.attMark.time) > 0 ? `${sel.attMark.time}분 지각` : "지각 처리됨", "#E8890C"]);
            if (sel.attMark?.type === "absent") rows.push(["결석", sel.attMark.reason ? `사유: ${sel.attMark.reason}` : "결석 처리됨", "#D2402E"]);
            if (sel.att && (sel.att.inTime || sel.att.inAt)) rows.push(["출석", `등원 ${sel.att.inTime || ""}${sel.att.outTime ? ` · 하원 ${sel.att.outTime}` : ""}`.trim(), "#1B8A5A"]);
            if (!rows.length) return <div style={{ fontSize: 13, color: "#999" }}>이 날은 표시할 일정이 없어요.</div>;
            return rows.map(([tag, text, color], i) => (
              <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "6px 0", borderTop: i ? "1px solid #f6f4ef" : "none" }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#fff", background: color, padding: "2px 8px", borderRadius: 999, flexShrink: 0 }}>{tag}</span>
                <span style={{ fontSize: 13.5, color: "#444", fontWeight: 600, lineHeight: 1.45 }}>{text}</span>
              </div>
            ));
          })()}
        </div>
      )}
    </div>
  );
}
