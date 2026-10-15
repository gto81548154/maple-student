import { TEACHER_DK_KO, TEACHER_TIME_CHOICES } from "../../domain/teacher.jsx";
import { fmtDateKR, fmtTime } from "../../domain/time.jsx";
import { MAX_W, TAP } from "../../theme/tokens.jsx";

// [122차수] 근무표 고치기 창 그리기(원장 전용). TeacherHome.jsx에서 그대로 옮김.
export function renderStaffScheduleModal(C) {
  const { home, saveStaffSchedule, schedBusy, schedEdit, schedMsg, setSchedEdit } = C;
  return (
          <div onClick={() => setSchedEdit(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.45)", zIndex: 4000, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
            <div onClick={(e) => e.stopPropagation()}
              style={{ width: "100%", maxWidth: MAX_W, maxHeight: "88vh", overflowY: "auto", background: "#fff", borderRadius: "18px 18px 0 0", padding: "18px 18px 26px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ fontSize: 16.5, fontWeight: 900, color: "#1a1a2e" }}>근무 고치기</div>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1C66A5" }}>{fmtDateKR(schedEdit.date)}</div>
                <button onClick={() => setSchedEdit(null)} style={{ minHeight: TAP, minWidth: TAP, marginLeft: "auto", border: "none", background: "#f0f2f5", borderRadius: 11, padding: "7px 11px", cursor: "pointer", fontWeight: 900, color: "#7f8fa6", fontFamily: "inherit" }}>✕</button>
              </div>
              <div style={{ fontSize: 12, color: "#9aa0ab", marginBottom: 14 }}>원장님만 고칠 수 있습니다. 고치면 그 사람 화면에 바로 반영됩니다.</div>

              {schedBusy && <div style={{ fontSize: 12.5, fontWeight: 800, color: "#1C66A5", marginBottom: 10 }}>저장 중...</div>}
              {schedMsg && <div style={{ fontSize: 12.5, fontWeight: 800, color: schedMsg.ok ? "#0b7a5c" : "#c2410c", background: schedMsg.ok ? "#e8f8f5" : "#fff7ed", border: `1px solid ${schedMsg.ok ? "#b7ecdf" : "#fed7aa"}`, borderRadius: 10, padding: "9px 11px", marginBottom: 12 }}>{schedMsg.text}</div>}

              {(home?.staff || []).map((st) => {
                const extra = (st.extraWorkDates || []).find(x => x && x.date === schedEdit.date);
                const dk = TEACHER_DK_KO[new Date(schedEdit.date + "T00:00:00").getDay()];
                const regular = (st.workDays || {})[dk];
                const hasRegular = regular !== undefined && regular !== null && regular !== false;
                const open = schedEdit.openId === String(st.id);
                return (
                  <div key={st.id} style={{ border: `1px solid ${open ? "#1C66A5" : "#eceef4"}`, borderRadius: 13, padding: "12px 13px", marginBottom: 9, background: "#fff" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
                      <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, background: "#eef1f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13.5, fontWeight: 800, color: "#5a6a85" }}>{String(st.name || "?")[0]}</span>
                      <span style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ display: "block", fontSize: 14, fontWeight: 800, color: "#2A2A28" }}>{st.name} <span style={{ fontSize: 11, fontWeight: 800, color: "#7f8fa6" }}>{st.role}</span></span>
                        <span style={{ display: "block", fontSize: 11.5, color: extra ? "#B45309" : hasRegular ? "#2A6FDB" : "#aab0bb", marginTop: 2, fontWeight: 700 }}>
                          {extra ? `추가 근무 · ${extra.time ? fmtTime(extra.time) : "시간 미정"}` : hasRegular ? `${dk}요일 근무 · ${regular ? fmtTime(regular) : "시간 미정"}` : "이 날 근무 없음"}
                        </span>
                      </span>
                      <button onClick={() => setSchedEdit(p => ({ ...p, openId: open ? "" : String(st.id) }))}
                        style={{ minHeight: TAP, flexShrink: 0, padding: "8px 11px", borderRadius: 9, border: "1px solid #dfe3ef", background: open ? "#182848" : "#fff", color: open ? "#fff" : "#5c6470", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>
                        {open ? "닫기" : "고치기"}
                      </button>
                    </div>

                    {open && (
                      <div style={{ marginTop: 12, borderTop: "1px solid #f1f3f7", paddingTop: 12 }}>
                        {/* 1) 이 날짜 추가 근무 */}
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#7f8fa6", marginBottom: 7 }}>이 날 추가 근무</div>
                        {extra ? (
                          <button onClick={() => saveStaffSchedule(st, { removeExtra: schedEdit.date })} disabled={schedBusy}
                            style={{ minHeight: TAP, width: "100%", padding: "11px", borderRadius: 10, border: "1px solid #f7c9cd", background: "#fff5f5", color: "#b03a2e", fontSize: 13, fontWeight: 800, cursor: "pointer", fontFamily: "inherit", marginBottom: 12 }}>
                            추가 근무 빼기 ({extra.time ? fmtTime(extra.time) : "시간 미정"})
                          </button>
                        ) : (
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 6, marginBottom: 12 }}>
                            {TEACHER_TIME_CHOICES.map(t => (
                              <button key={t} onClick={() => saveStaffSchedule(st, { addExtra: { date: schedEdit.date, time: t } })} disabled={schedBusy}
                                style={{ minHeight: TAP, padding: "9px 4px", borderRadius: 8, border: "1px solid #dfe3ef", background: "#fff", color: "#5c6470", fontSize: 12.5, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{t}</button>
                            ))}
                          </div>
                        )}

                        {/* 2) 요일 근무표 */}
                        <div style={{ fontSize: 12, fontWeight: 800, color: "#7f8fa6", marginBottom: 7 }}>요일 근무표 — 요일을 눌러 켜고 끕니다</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,minmax(0,1fr))", gap: 2 /* [136차수] 4→2: 폰(390)에서 요일 단추 폭이 43이라 44에 1 모자랐음 */, marginBottom: 9 }}>
                          {TEACHER_DK_KO.map(d => {
                            const on = (st.workDays || {})[d] !== undefined;
                            return (
                              <button key={d} onClick={() => saveStaffSchedule(st, { toggleDay: d })} disabled={schedBusy}
                                style={{ minHeight: TAP, padding: "10px 0", borderRadius: 999, border: `1px solid ${on ? "#182848" : "#dfe3ef"}`, background: on ? "#182848" : "#fff", color: on ? "#fff" : "#9aa0ab", fontSize: 13, fontWeight: 900, cursor: "pointer", fontFamily: "inherit" }}>{d}</button>
                            );
                          })}
                        </div>
                        {TEACHER_DK_KO.filter(d => (st.workDays || {})[d] !== undefined).map(d => (
                          <div key={d} style={{ marginBottom: 8 }}>
                            <div style={{ fontSize: 11.5, fontWeight: 800, color: "#5c6470", marginBottom: 5 }}>{d}요일 출근 시간</div>
                            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,minmax(0,1fr))", gap: 5 }}>
                              {TEACHER_TIME_CHOICES.map(t => {
                                const on = String((st.workDays || {})[d] || "") === t;
                                return (
                                  <button key={t} onClick={() => saveStaffSchedule(st, { setDayTime: { day: d, time: t } })} disabled={schedBusy}
                                    style={{ minHeight: TAP, padding: "8px 4px", borderRadius: 8, border: `1px solid ${on ? "#2A6FDB" : "#dfe3ef"}`, background: on ? "#2A6FDB" : "#fff", color: on ? "#fff" : "#7b8494", fontSize: 12, fontWeight: 800, cursor: "pointer", fontFamily: "inherit" }}>{t}</button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
  );
}
