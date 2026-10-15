import { TAP } from "../../theme/tokens.jsx";
import { HOLIDAYS } from "../../data/holidays.jsx";
import { TEACHER_DK_KO, computeTeacherDayRoster, teacherWorkOn } from "../../domain/teacher.jsx";
import { fmtDateKR, fmtTime, fmtYMD } from "../../domain/time.jsx";

// [122차수] 선생님 캘린더 탭 그리기. TeacherHome.jsx에서 그대로 옮김.
export function renderTeacherCalTab(C) {
  const { calSel, calYm, card, home, openStudent, roster, schedPressRef, setCalSel, setCalYm, setSchedEdit, teacher, today } = C;
          const first = new Date(calYm.y, calYm.m, 1);
          const firstDow = first.getDay();
          const daysInMonth = new Date(calYm.y, calYm.m + 1, 0).getDate();
          // [85차수 08-31 · 원장 요청] 앞뒤 빈칸을 전달·다음달 날짜(연회색)로 채운다 — 누르면 달력이 그 달로 넘어간다
          const cells = [];
          for (let i = firstDow; i > 0; i--) cells.push(new Date(calYm.y, calYm.m, 1 - i));
          for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(calYm.y, calYm.m, d));
          for (let d = 1; cells.length % 7 !== 0; d++) cells.push(new Date(calYm.y, calYm.m + 1, d));
          const move = (diff) => setCalYm(p => { const d = new Date(p.y, p.m + diff, 1); return { y: d.getFullYear(), m: d.getMonth() }; });
          const allHol = { ...HOLIDAYS, ...((roster && roster.holidays) || {}) };
          const holName = (v) => (typeof v === "string" ? v : (v && v.name) || "휴원");
          const navBtn = { width: TAP, height: TAP, borderRadius: 11, border: "1px solid #e5e0d8", background: "#faf9f7", cursor: "pointer", fontSize: 13, fontWeight: 800, color: "#555" };
          const selWorkRaw = teacherWorkOn(teacher, calSel);
          const selWork = (allHol[calSel] && !(selWorkRaw && selWorkRaw.kind === "추가")) ? null : selWorkRaw;   // [135차수 f] 휴원일은 근무일이 아님(추가 근무는 예외)
          const selRoll = computeTeacherDayRoster(roster?.students || [], roster?.makeups || [], calSel);
          const selHol = allHol[calSel];
          return (
            <div>
              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: "14px 12px", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
                  <button onClick={() => move(-1)} style={navBtn}>◀</button>
                  <div style={{ fontSize: 16, fontWeight: 800, color: "#2A2A28" }}>{calYm.y}년 {calYm.m + 1}월</div>
                  <button onClick={() => move(1)} style={navBtn}>▶</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 }}>
                  {TEACHER_DK_KO.map((w, i) => (
                    <div key={w} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, color: i === 0 ? "#D2402E" : i === 6 ? "#2A6FDB" : "#999", padding: "4px 0" }}>{w}</div>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
                  {cells.map((dObj, idx) => {
                    if (!dObj) return <div key={"e" + idx} />;
                    const out = dObj.getMonth() !== calYm.m;   // [85차수] 전달·다음달 날짜 — 연하게, 누르면 그 달로
                    const ds = fmtYMD(dObj);
                    const hol = allHol[ds];
                    const wRaw = teacherWorkOn(teacher, ds);
                    const w = (hol && !(wRaw && wRaw.kind === "추가")) ? null : wRaw;   // [135차수 f] 휴원일에는 "출근" 표시를 안 한다(일부러 넣은 추가 근무는 예외)
                    const isSel = ds === calSel;
                    const isToday = ds === today;
                    return (
                      <button key={ds} onClick={() => { if (out) setCalYm({ y: dObj.getFullYear(), m: dObj.getMonth() }); setCalSel(ds); }}
                        // [근무표 수정 15차수] 원장만 — 길게 누르기(폰) / 우클릭(PC)으로 근무 고치기 창
                        onContextMenu={home?.isOwner ? (e) => { e.preventDefault(); setCalSel(ds); setSchedEdit({ date: ds, openId: "" }); } : undefined}
                        onTouchStart={home?.isOwner ? () => { schedPressRef.current = setTimeout(() => { setCalSel(ds); setSchedEdit({ date: ds, openId: "" }); }, 550); } : undefined}
                        onTouchEnd={home?.isOwner ? () => { clearTimeout(schedPressRef.current); } : undefined}
                        onTouchMove={home?.isOwner ? () => { clearTimeout(schedPressRef.current); } : undefined}
                        style={{
                        minHeight: 52, padding: "5px 2px 4px", borderRadius: 9, cursor: "pointer",
                        opacity: out ? 0.5 : 1,
                        border: isSel ? "1.8px solid #2A6FDB" : isToday ? "1.5px solid #b9cff2" : w && w.kind === "추가" ? "1.5px solid #F2C14E" : "1px solid transparent",
                        background: hol ? "#FDF0EE" : w ? "#F0F6FF" : "#fff",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      }}>
                        <span style={{ fontSize: 12.5, fontWeight: isToday ? 800 : 600, color: out ? "#b6bac4" : hol ? "#D2402E" : dObj.getDay() === 0 ? "#D2402E" : dObj.getDay() === 6 ? "#2A6FDB" : "#333" }}>{dObj.getDate()}</span>
                        {/* [12차수 원장 지시] 칸에 사람 수를 적지 않는다 — 근무일이면 "출근"만 */}
                        <span style={{ minHeight: 12, fontSize: 11, fontWeight: 800, color: w ? "#2A6FDB" : "#c8cdd8", lineHeight: 1 }}>{w ? "출근" : ""}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, padding: "8px 4px 0", borderTop: "1px solid #f2efe9" }}>
                  {[["#F0F6FF", "근무일"], ["#FDF0EE", "휴원"]].map(([c, label]) => (
                    <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#777", fontWeight: 600 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c, border: "1px solid #e0dcd4", display: "inline-block" }} />{label}
                    </span>
                  ))}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: "#777", fontWeight: 600 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: "#fff", border: "1.5px solid #F2C14E", display: "inline-block" }} />추가 근무
                  </span>
                  {home?.isOwner && <span style={{ fontSize: 11, color: "#7f8fa6", fontWeight: 700 }}>날짜를 길게 누르면 근무를 고칠 수 있어요</span>}

                </div>
              </div>

              <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #eee", padding: "14px 16px", marginTop: 12, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: "#2A2A28" }}>{fmtDateKR(calSel)}</div>
                  {calSel === today && <span style={{ fontSize: 11, fontWeight: 800, color: "#0c5a9e", background: "#e8f2fc", borderRadius: 999, padding: "2px 8px" }}>오늘</span>}
                </div>
                {selHol && <div style={{ fontSize: 13, fontWeight: 700, color: "#D2402E", marginBottom: 7 }}>휴원 · {holName(selHol)}</div>}
                <div style={{ fontSize: 13.5, fontWeight: 700, color: selWork ? "#2A6FDB" : "#9aa0ab", marginBottom: 10 }}>
                  {selWork ? `${selWork.kind === "추가" ? "추가 근무" : "근무"} · ${selWork.time ? `${fmtTime(selWork.time)} 출근` : "시간 미정"}` : "근무일이 아닙니다"}
                </div>
                {selRoll.length === 0 ? (
                  <div style={{ fontSize: 13, color: "#9aa0ab" }}>이 날 수업하는 학생이 없습니다.</div>
                ) : (
                  <>
                    <div style={{ fontSize: 12, fontWeight: 800, color: "#7f8fa6", marginBottom: 7 }}>수업 학생</div>
                    {selRoll.map(({ student: s, time, kind }) => (
                      <button key={s.id} onClick={() => openStudent(s)} style={{ minHeight: TAP, ...card, marginBottom: 6, padding: "10px 12px" }}>
                        <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: "#2A2A28" }}>
                          {s.name}
                          {kind !== "정규" && <span style={{ marginLeft: 6, fontSize: 11, fontWeight: 800, color: "#b45309", background: "#fef3e7", padding: "2px 6px", borderRadius: 999 }}>{kind}</span>}
                        </span>
                        {time && <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 800, color: "#1C66A5", background: "#eaf2fb", padding: "3px 8px", borderRadius: 8 }}>{time}</span>}
                      </button>
                    ))}
                  </>
                )}
              </div>
            </div>
          );
}
