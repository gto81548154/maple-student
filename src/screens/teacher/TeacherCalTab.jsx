import { TAP, UI } from "../../theme/tokens.jsx";
import { HOLIDAYS } from "../../data/holidays.jsx";
import { TEACHER_DK_KO, teacherWorkOn } from "../../domain/teacher.jsx";
import { fmtDateKR, fmtTime, fmtYMD } from "../../domain/time.jsx";

// [122차수] 선생님 캘린더 탭 그리기. TeacherHome.jsx에서 그대로 옮김.
export function renderTeacherCalTab(C) {
  const { calSel, calYm, home, roster, schedPressRef, setCalSel, setCalYm, setSchedEdit, teacher, today } = C;
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
          const navBtn = { width: TAP, height: TAP, borderRadius: 11, border: "1px solid #e5e0d8", background: "#faf9f7", cursor: "pointer", fontSize: 13, fontWeight: 800, color: UI.sub };
          const selWorkRaw = teacherWorkOn(teacher, calSel);
          const selWork = (allHol[calSel] && !(selWorkRaw && selWorkRaw.kind === "추가")) ? null : selWorkRaw;   // [135차수 f] 휴원일은 근무일이 아님(추가 근무는 예외)
          // [180차수] 보고 있는 달의 근무일 — 달력 칸과 같은 규칙(휴원일은 빼고, 추가 근무는 넣는다)
          const monthWork = [];
          for (let d = 1; d <= daysInMonth; d++) {
            const dObj = new Date(calYm.y, calYm.m, d), ds = fmtYMD(dObj);
            const w = teacherWorkOn(teacher, ds);
            if (w && !(allHol[ds] && w.kind !== "추가")) monthWork.push({ ds, d: dObj, w });
          }
          const selHol = allHol[calSel];
          return (
            <div>
              <div style={{ background: "#fff", borderRadius: 14, border: `1px solid ${UI.line}`, padding: "14px 12px", boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, padding: "0 4px" }}>
                  <button onClick={() => move(-1)} style={navBtn}>◀</button>
                  <div style={{ fontSize: 16, fontWeight: 800, color: UI.text }}>{calYm.y}년 {calYm.m + 1}월</div>
                  <button onClick={() => move(1)} style={navBtn}>▶</button>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", marginBottom: 4 }}>
                  {TEACHER_DK_KO.map((w, i) => (
                    <div key={w} style={{ textAlign: "center", fontSize: 11.5, fontWeight: 700, color: i === 0 ? "#D2402E" : i === 6 ? UI.blue : UI.dim, padding: "4px 0" }}>{w}</div>
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
                        border: isSel ? `1.8px solid ${UI.blue}` : isToday ? "1.5px solid #b9cff2" : w && w.kind === "추가" ? "1.5px solid #F2C14E" : "1px solid transparent",
                        background: hol ? "#FDF0EE" : w ? UI.blueBg : "#fff",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      }}>
                        <span style={{ fontSize: 12.5, fontWeight: isToday ? 800 : 600, color: out ? "#b6bac4" : hol ? "#D2402E" : dObj.getDay() === 0 ? "#D2402E" : dObj.getDay() === 6 ? UI.blue : "#333" }}>{dObj.getDate()}</span>
                        {/* [12차수 원장 지시] 칸에 사람 수를 적지 않는다 — 근무일이면 "출근"만 */}
                        <span style={{ minHeight: 12, fontSize: 11, fontWeight: 800, color: w ? UI.blue : "#c8cdd8", lineHeight: 1 }}>{w ? "출근" : ""}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, padding: "8px 4px 0", borderTop: "1px solid #f2efe9" }}>
                  {[[UI.blueBg, "근무일"], ["#FDF0EE", "휴원"]].map(([c, label]) => (
                    <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: UI.sub, fontWeight: 600 }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3, background: c, border: "1px solid #e0dcd4", display: "inline-block" }} />{label}
                    </span>
                  ))}
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, color: UI.sub, fontWeight: 600 }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: "#fff", border: "1.5px solid #F2C14E", display: "inline-block" }} />추가 근무
                  </span>
                  {home?.isOwner && <span style={{ fontSize: 11, color: UI.sub, fontWeight: 700 }}>날짜를 길게 누르면 근무를 고칠 수 있어요</span>}

                </div>
              </div>

              <div style={{ background: "#fff", borderRadius: 14, border: `1px solid ${UI.line}`, padding: "14px 16px", marginTop: 12, boxShadow: "0 1px 4px rgba(0,0,0,.04)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 9 }}>
                  <div style={{ fontSize: 14.5, fontWeight: 800, color: UI.text }}>{fmtDateKR(calSel)}</div>
                  {calSel === today && <span style={{ fontSize: 11, fontWeight: 800, color: "#0c5a9e", background: UI.blueBg, borderRadius: 999, padding: "2px 8px" }}>오늘</span>}
                </div>
                {selHol && <div style={{ fontSize: 13, fontWeight: 700, color: "#D2402E", marginBottom: 7 }}>휴원 · {holName(selHol)}</div>}
                <div style={{ fontSize: 13.5, fontWeight: 700, color: selWork ? UI.blue : UI.dim, marginBottom: 10 }}>
                  {selWork ? `${selWork.kind === "추가" ? "추가 근무" : "근무"} · ${selWork.time ? `${fmtTime(selWork.time)} 출근` : "시간 미정"}` : "근무일이 아닙니다"}
                </div>
                {/* [180차수 원장 요청 11-19] 수업 학생 명단은 뺐다(학생은 [학생] 탭에서 본다). 대신 보고 있는 달의 근무일을 모아 보여준다. */}
                <div style={{ borderTop: `1px solid ${UI.line}`, paddingTop: 11 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 12, fontWeight: 800, color: UI.sub }}>{calYm.m + 1}월 근무</span>
                    <span style={{ fontSize: 13.5, fontWeight: 800, color: UI.text }}>{monthWork.length}일</span>
                  </div>
                  {monthWork.length === 0 ? (
                    <div style={{ fontSize: 13, color: UI.dim }}>이 달에는 근무일이 없습니다.</div>
                  ) : (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {monthWork.map(({ ds, d, w }) => (
                        <button key={ds} type="button" onClick={() => setCalSel(ds)}
                          style={{ minHeight: TAP, padding: "6px 10px", borderRadius: 10, cursor: "pointer", fontFamily: "inherit", textAlign: "left",
                            border: `1px solid ${ds === calSel ? UI.blue : w.kind === "추가" ? "#F2C14E" : UI.line}`, background: ds < today ? UI.bg : "#fff" }}>
                          <span style={{ display: "block", fontSize: 12.5, fontWeight: 800, color: ds < today ? UI.sub : UI.text }}>{d.getDate()}일 ({TEACHER_DK_KO[d.getDay()]})</span>
                          <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: UI.blue, marginTop: 2 }}>{w.time ? fmtTime(w.time) : "시간 미정"}{w.kind === "추가" ? " · 추가" : ""}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
}
