import { useState } from "react";
import { HOLIDAYS } from "../../data/holidays.jsx";
import { getEngExamDateForDday, getExamStartEndForDday, isExamVisibleForStudentDday } from "../../domain/dday.jsx";
import { DAYS_EN, fmtYMD, getEffectiveSchedule, getStudentVacation, isDateLessonStudent } from "../../domain/time.jsx";
import { TAP, UI } from "../../theme/tokens.jsx";

// ═══ [141차수] 한 달 달력 공용 부품 — 홈 ⑤ 카드와 더보기 > 수업 일정이 같이 쓴다 ═══
//   StudentCalendarTab 안에 있던 달력 그리는 부분을 그대로 빼 왔다. 데이터(등원일·휴원·시험·보강·출석)와 판정 규칙은 전과 같다.
//   frame="card"  : 수업 일정 화면 — 달력을 흰 카드로 감싸고, 고른 날 정보는 아래 따로 카드로 그린다.
//   frame="plain" : 홈 카드 안 — 감싸지 않고 그대로 그리고, 고른 날 정보는 같은 카드 안에 줄을 그어 이어 붙인다.
//   folded=true   : 오늘이 든 주 + 다음 주(2주)만 보인다. 이때는 달 넘기기 ◀ ▶를 숨긴다(펼치면 다시 보인다).
//   [164차수 원장 결정 11-11] 처음에는 아무 날도 고르지 않고, 달력 아래에 "그 달 남은 수업"을 쭉 보여 준다(오늘 수업은 오늘 밤까지 남고, 지난 수업은 뺀다).
//     날짜를 누르면 전처럼 그날 기록(등원·지각·결석·출석)이 나오고, 같은 날짜를 또 누르거나 "남은 수업 보기"를 누르면 목록으로 돌아온다. 접힘(2주)일 때는 보이는 2주 안의 수업만 적는다.
//   [141차수] 오늘 칸 = 남색 꽉 채움 + 흰 글씨(홈 요일 줄과 같게). 칸 색과 글자는 [166차수] 규칙(아래 KIND)을 따른다.
const WEEK_KO = ["일", "월", "화", "수", "목", "금", "토"];
// [166차수 원장 결정 11-11] 달력 색을 다섯 가지로 다시 나눴다(겹치는 색 없이). 칸 표시 글자는 전부 두 글자.
//   등원일 = 연파랑 / 보강·변경 = 연보라 + "보강"·"변경" / 시험 = 연노랑 + "시험"(내 영어 시험 날은 "영어시험") / 휴원·방학 = 연회색(휴원은 "휴원" 글자) / 결석 = 연빨강 + "결석"
//   방학은 휴원과 합쳤다: 방학 중 오는 날은 그냥 등원일(파랑), 안 오는 날은 회색. 칸에는 출석 ✓·지각 △를 그리지 않는다(결석만). 날짜를 누르면 지각·출석 기록은 전처럼 보인다.
const KIND = {
  at: { bg: "#E6F0FF", fg: "" },
  mk: { bg: "#EFE4FB", fg: "#6B3FA0" },
  exam: { bg: "#FFF1B8", fg: "#7A5200" },
  off: { bg: "#E9E9EC", fg: "#6B6B70" },
  absent: { bg: "#FCE1DD", fg: "#B3261E" },
  none: { bg: "#fff", fg: "" },
};
const kindOf = (info) => (info.attMark?.type === "absent" ? "absent" : (info.hol && info.attendTime == null) ? "off" : info.dayExams.length > 0 ? "exam" : info.visMk ? "mk" : info.attendTime != null ? "at" : info.isVac ? "off" : "none");

export function StudentMonthCalendar({ student, makeups, customHolidays, exams, attLog, attStatus, frame = "card", folded = false }) {
  const todayObj = new Date(); todayObj.setHours(0, 0, 0, 0);
  const todayStr = fmtYMD(todayObj);
  const [ym, setYm] = useState({ y: todayObj.getFullYear(), m: todayObj.getMonth() });
  const [selDate, setSelDate] = useState(null);

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
  // [141차수] 내 학년 영어 시험 날이면 "영어시험", 시험 기간의 다른 날은 "시험기간"
  const isEngExamDay = (ds, dayExams) => dayExams.some((ex) => String(getEngExamDateForDday(ex, student) || "").slice(0, 10) === ds);
  const dayInfo = (ds, dObj) => {
    const hol = allHol[ds];
    const hiddenMk = mks.some((m) => m.date === ds && m.isHidden);
    const visMk = mks.find((m) => m.date === ds && !m.isHidden);
    const attMark = attStatusOf(ds);
    let attendTime = null;
    if ((!hol || attMark?.type === "present" || attMark?.type === "late") && !hiddenMk && attMark?.type !== "absent") {
      if (visMk) attendTime = visMk.time || "";
      else {
        const dayKey = DAYS_EN[dObj.getDay() === 0 ? 6 : dObj.getDay() - 1];
        const eff = getEffectiveSchedule(student, ds);
        attendTime = (eff && eff.schedule && eff.schedule[dayKey]) || null;
      }
    }
    const dayExams = examsOf(ds);
    return { hol, hiddenMk, visMk, attendTime, isVac: !!getStudentVacation(student, ds), att: attOf(ds), attMark, dayExams, engExam: dayExams.length > 0 && isEngExamDay(ds, dayExams) };
  };

  // 접힘: 오늘이 든 주(일요일 시작) + 다음 주 = 14칸. 펼침: 그 달 전부(앞뒤 빈칸은 전달·다음달 날짜).
  const cells = [];
  if (folded) {
    const start = new Date(todayObj); start.setDate(start.getDate() - start.getDay());
    for (let i = 0; i < 14; i++) { const d = new Date(start); d.setDate(start.getDate() + i); cells.push(d); }
  } else {
    const first = new Date(ym.y, ym.m, 1);
    const firstDow = first.getDay(); // 0=일요일 시작
    const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
    // [85차수 08-31 · 원장 요청] 앞뒤 빈칸을 전달·다음달 날짜(연회색)로 채운다 — 누르면 달력이 그 달로 넘어간다
    for (let i = firstDow; i > 0; i--) cells.push(new Date(ym.y, ym.m, 1 - i));
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(ym.y, ym.m, d));
    for (let d = 1; cells.length % 7 !== 0; d++) cells.push(new Date(ym.y, ym.m + 1, d));
  }
  const shownY = folded ? todayObj.getFullYear() : ym.y;
  const shownM = folded ? todayObj.getMonth() : ym.m;
  const move = (diff) => setYm((p) => { const d = new Date(p.y, p.m + diff, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
  const sel = selDate ? dayInfo(selDate, new Date(selDate + "T00:00:00")) : null;
  const navBtn = { width: TAP, height: TAP, borderRadius: 11, border: "1px solid #e5e0d8", background: "#faf9f7", cursor: "pointer", fontSize: 13, fontWeight: 800, color: "#555" };
  const legendItem = { display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#777", fontWeight: 600 };

  const calendar = (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
        {folded ? <span style={{ width: TAP }} /> : <button type="button" onClick={() => move(-1)} aria-label="전달" style={navBtn}>◀</button>}
        <div style={{ fontSize: 16, fontWeight: 800, color: "#2A2A28" }}>{shownY}년 {shownM + 1}월</div>
        {folded ? <span style={{ width: TAP }} /> : <button type="button" onClick={() => move(1)} aria-label="다음달" style={navBtn}>▶</button>}
      </div>
      {/* [144차수] 회차(날짜 찍은) 학생은 방학 시간표를 쓰지 않으므로 방학 알약도 안 띄운다 */}
      {!isDateLessonStudent(student) && student?.vacationSchedule?.startDate && student?.vacationSchedule?.endDate && (
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
        {cells.map((dObj) => {
          const out = !folded && dObj.getMonth() !== ym.m;   // [85차수] 전달·다음달 날짜 — 연하게, 누르면 그 달로 (접힘 2주에서는 전부 진하게)
          const ds = fmtYMD(dObj);
          const info = dayInfo(ds, dObj);
          const isSel = ds === selDate;
          const isToday = ds === todayStr;
          const kind = kindOf(info);
          const K = KIND[kind];
          const label = kind === "absent" ? "결석" : (kind === "off" && info.hol) ? "휴원" : kind === "exam" ? (info.engExam ? "영어시험" : "시험") : kind === "mk" ? (info.visMk.isOverride ? "변경" : "보강") : "";
          const numColor = isToday ? "#fff" : out ? "#b6bac4" : kind === "off" ? "#77777C" : dObj.getDay() === 0 ? "#D2402E" : dObj.getDay() === 6 ? "#2A6FDB" : "#333";
          return (
            <button key={ds} type="button" data-student-calendar-date={ds} data-kind={kind} onClick={() => { if (out) setYm({ y: dObj.getFullYear(), m: dObj.getMonth() }); setSelDate(isSel ? null : ds); }} style={{
              minHeight: 52, padding: "5px 1px 4px", borderRadius: 9, cursor: "pointer", fontFamily: "inherit",
              opacity: out ? 0.5 : 1,
              border: isSel ? "1.8px solid #2A6FDB" : isToday ? `1.5px solid ${UI.navy}` : "1px solid transparent",
              background: isToday ? UI.navy : K.bg,
              display: "flex", flexDirection: "column", alignItems: "center", gap: 2, boxSizing: "border-box", minWidth: 0,
            }}>
              <span style={{ fontSize: 12.5, fontWeight: isToday ? 800 : 600, color: numColor }}>{dObj.getDate()}</span>
              {label && (
                /* 칸이 좁아도 두 줄로 안 꺾이게 — "영어시험"만 글자를 살짝 줄인다 */
                <span style={{ fontSize: label.length > 2 ? 9.5 : 11, fontWeight: 800, color: isToday ? "#fff" : K.fg, lineHeight: 1.15, whiteSpace: "nowrap", letterSpacing: label.length > 2 ? -0.2 : 0, maxWidth: "100%", overflow: "hidden" }}>{label}</span>
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, padding: "8px 4px 0", borderTop: "1px solid #f2efe9" }}>
        {[[KIND.at.bg, "등원일"], [KIND.mk.bg, "보강·변경"], [KIND.exam.bg, "시험"], [KIND.off.bg, "휴원·방학"], [KIND.absent.bg, "결석"]].map(([c, label]) => (
          <span key={label} style={legendItem}>
            <span style={{ width: 10, height: 10, borderRadius: 3, background: c, border: "1px solid rgba(0,0,0,0.06)", display: "inline-block" }} />{label}
          </span>
        ))}
      </div>
    </div>
  );

  const detailRows = sel && (() => {
    const rows = [];
    if (sel.hol) rows.push(["휴원", holName(sel.hol), "#6B6B70"]);
    sel.dayExams.forEach((ex) => {
      const { start, end } = getExamStartEndForDday(ex);
      const period = start && end && start !== end ? `${String(start).slice(5, 10)} ~ ${String(end).slice(5, 10)}` : "";
      rows.push([sel.engExam ? "영어시험" : "시험", `${ex.name || ex.type || "시험"}${period ? ` (${period})` : ""}`, "#8A6200"]);
    });
    if (sel.visMk && sel.attMark?.type !== "absent") rows.push([sel.visMk.isOverride ? "시간변경" : "보강", sel.visMk.time ? `${sel.visMk.time} 등원` : "시간 미정", "#8E44AD"]);
    else if (sel.attendTime && sel.attMark?.type !== "absent") rows.push([sel.isVac ? "방학 시간표" : "등원", `${sel.attendTime} 등원${selDate < todayStr ? "" : " 예정"}`, "#2A6FDB"]);   // [96차수] 지난 날은 "예정"을 뺀다
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
  })();
  const detailTitle = sel && (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }}>
      <div style={{ fontSize: 14.5, fontWeight: 800, color: "#2A2A28" }}>
        {Number(selDate.slice(5, 7))}월 {Number(selDate.slice(8, 10))}일 ({WEEK_KO[new Date(selDate + "T00:00:00").getDay()]})
      </div>
      <button type="button" data-student-calendar-back="1" onClick={() => setSelDate(null)} style={{ border: "none", background: "transparent", color: "#2A6FDB", fontSize: 12.5, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", padding: "6px 2px" }}>남은 수업 보기 ›</button>
    </div>
  );

  // [164차수] 남은 수업 목록 — 오늘부터(오늘 포함) 그 달 끝까지 등원하는 날. 접힘이면 보이는 2주 안에서만.
  const upcoming = (() => {
    const days = folded ? cells : cells.filter((d) => d.getMonth() === ym.m && d.getFullYear() === ym.y);
    const list = [];
    days.forEach((dObj) => {
      const ds = fmtYMD(dObj);
      if (ds < todayStr) return;
      const info = dayInfo(ds, dObj);
      if (info.attendTime == null) return;
      list.push({ ds, dObj, info });
    });
    return list;
  })();
  const monthIsPast = !folded && (ym.y < todayObj.getFullYear() || (ym.y === todayObj.getFullYear() && ym.m < todayObj.getMonth()));
  const listTitle = folded ? "2주 안 남은 수업" : (ym.y === todayObj.getFullYear() && ym.m === todayObj.getMonth()) ? `${ym.m + 1}월 남은 수업` : `${ym.m + 1}월 수업`;
  // [165차수 원장 요청 11-11] 한 줄로 쭉 내려가면 너무 길어서 두 줄(왼쪽 → 오른쪽)로 나눠 적는다. 화면이 아주 좁으면 저절로 한 줄이 된다. 칸이 좁아 알약 글자를 줄였다.
  //   [166차수] 알약은 달력 칸과 같은 색(연한 바탕 + 진한 글자). 알약이 하나(두 글자)면 날짜 옆에, 둘 이상이거나 글자가 길면("영어시험") 아랫줄로 내려서 겹치지 않게 한다.
  const pill = (text, bg, fg) => <span key={text} style={{ fontSize: 10.5, fontWeight: 800, color: fg, background: bg, padding: "1px 6px", borderRadius: 999, flexShrink: 0, whiteSpace: "nowrap" }}>{text}</span>;
  const pillsOf = (ds, info) => {
    const out = [];
    if (ds === todayStr) out.push(["오늘", UI.navy, "#fff"]);
    if (info.visMk) out.push([info.visMk.isOverride ? "변경" : "보강", KIND.mk.bg, KIND.mk.fg]);
    if (info.dayExams.length > 0) out.push([info.engExam ? "영어시험" : "시험", KIND.exam.bg, KIND.exam.fg]);
    return out;
  };
  const upcomingBlock = (
    <div data-student-calendar-upcoming="1">
      <div style={{ fontSize: 14.5, fontWeight: 800, color: "#2A2A28", marginBottom: 6 }}>{listTitle}</div>
      {upcoming.length === 0 ? (
        <div style={{ fontSize: 13, color: "#999", padding: "4px 0" }}>{monthIsPast ? "지난 달이에요." : "남은 수업이 없어요."}</div>
      ) : (
        <div style={{ columns: "132px 2", columnGap: 18, columnRule: "1px solid #f2efe9" }}>
          {upcoming.map(({ ds, dObj, info }) => {
            const pills = pillsOf(ds, info);
            const below = pills.length > 1 || pills.some(([t]) => t.length > 2);
            return (
              <button key={ds} type="button" data-student-calendar-upcoming-date={ds} onClick={() => setSelDate(ds)} style={{
                display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 5, rowGap: 3, width: "100%", minHeight: 36, padding: "6px 0", border: "none", borderBottom: "1px solid #f6f4ef",
                background: "transparent", cursor: "pointer", fontFamily: "inherit", textAlign: "left", boxSizing: "border-box", breakInside: "avoid",
              }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: "#333", flexShrink: 0, whiteSpace: "nowrap" }}>
                  {folded || dObj.getMonth() !== ym.m ? `${dObj.getMonth() + 1}/${dObj.getDate()}` : `${dObj.getDate()}일`} ({WEEK_KO[dObj.getDay()]})
                </span>
                {!below && pills.map(([t, bg, fg]) => pill(t, bg, fg))}
                <span style={{ marginLeft: "auto", fontSize: 13, fontWeight: 800, color: "#2A6FDB", flexShrink: 0, whiteSpace: "nowrap" }}>{info.attendTime ? info.attendTime : "미정"}</span>
                {below && <span style={{ display: "flex", gap: 4, flexBasis: "100%" }}>{pills.map(([t, bg, fg]) => pill(t, bg, fg))}</span>}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ fontSize: 11.5, color: "#999", marginTop: 8 }}>날짜를 누르면 그날 기록(출석·지각·결석)을 볼 수 있어요.</div>
    </div>
  );

  if (frame === "plain") {
    return (
      <div>
        {calendar}
        {sel ? (
          <div data-student-calendar-detail="1" style={{ marginTop: 12, padding: "12px 2px 0", borderTop: "1px solid #f2efe9" }}>
            {detailTitle}
            {detailRows}
          </div>
        ) : (
          <div style={{ marginTop: 12, padding: "12px 2px 0", borderTop: "1px solid #f2efe9" }}>{upcomingBlock}</div>
        )}
      </div>
    );
  }
  return (
    <div>
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: "14px 12px", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
        {calendar}
      </div>
      {sel ? (
        <div data-student-calendar-detail="1" style={{ background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: "14px 16px", marginTop: 12, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
          {detailTitle}
          {detailRows}
        </div>
      ) : (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: "14px 16px", marginTop: 12, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>{upcomingBlock}</div>
      )}
    </div>
  );
}
